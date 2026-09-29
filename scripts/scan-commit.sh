#!/usr/bin/env bash
# Runs the pipeline's tests and security scans against one commit and writes JUnit XML for
# each, so real results can be loaded into the dashboard (see scripts/seed.mjs).
#   scripts/scan-commit.sh <commit> <out-dir>
# Needs Docker and a Postgres reachable at $TEST_DATABASE_URL for the API tests.
set -euo pipefail
commit=$1
out=$(realpath -m "$2")
repo=$(git rev-parse --show-toplevel)
zap_image=${ZAP_IMAGE:-ghcr.io/zaproxy/zaproxy:stable}
trivy_image=${TRIVY_IMAGE:-aquasec/trivy:0.74.0}
tag="std-scan:${commit:0:7}"
net="std-scan-${commit:0:7}"
work=$(mktemp -d)
mkdir -p "$out"

cleanup() {
  docker rm -f "$net-db" "$net-app" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  git -C "$repo" worktree remove --force "$work/src" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

git -C "$repo" worktree add --detach "$work/src" "$commit" >/dev/null
git -C "$repo" log -1 --format=%cI "$commit" > "$out/committed-at"

# Unit and integration tests
(cd "$work/src" && npm ci --silent >/dev/null && \
  npm run test --workspaces -- --reporter=junit --outputFile.junit=junit.xml >/dev/null 2>&1 || true)
cp "$work/src/apps/api/junit.xml" "$out/api-tests.xml"
cp "$work/src/apps/web/junit.xml" "$out/web-tests.xml"

# Image + Trivy
docker build -q -t "$tag" "$work/src" >/dev/null
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "$trivy_image" image --quiet \
  --scanners vuln,secret --format json "$tag" > "$work/trivy.json"
npx --prefix "$repo/apps/api" tsx "$repo/apps/api/src/cli/to-junit.ts" trivy "$work/trivy.json" trivy-image > "$out/trivy-image.xml"

# Start the app, then ZAP (current rules file for every commit, so the gate is comparable)
token=$(openssl rand -hex 32)
docker network create "$net" >/dev/null
docker run -d --name "$net-db" --network "$net" -e POSTGRES_USER=d -e POSTGRES_PASSWORD=d -e POSTGRES_DB=d postgres:16-alpine >/dev/null
until docker exec "$net-db" pg_isready -U d >/dev/null 2>&1; do sleep 1; done
docker run -d --name "$net-app" --network "$net" -p 127.0.0.1:18080:8080 \
  -e PGHOST="$net-db" -e PGUSER=d -e PGPASSWORD=d -e PGDATABASE=d -e INGEST_TOKEN="$token" \
  -e RATE_LIMIT_READS_PER_MIN=100000 -e RATE_LIMIT_UPLOADS_PER_MIN=100000 "$tag" >/dev/null
until curl -fs http://127.0.0.1:18080/healthz >/dev/null; do sleep 1; done
(cd "$work/src" && BASE_URL=http://127.0.0.1:18080 INGEST_TOKEN=$token node scripts/seed.mjs >/dev/null)

mkdir -p "$work/zap" && chmod 777 "$work/zap"
cp "$repo/.zap/rules.tsv" "$work/zap/"
sed 's#http://localhost:8080#http://127.0.0.1:18080#' "$repo/apps/api/openapi.yaml" > "$work/zap/openapi.yaml"
docker run --rm --network host -v "$work/zap:/zap/wrk:rw" "$zap_image" \
  zap-baseline.py -t http://127.0.0.1:18080 -c rules.tsv -j > "$work/zap-baseline.log" 2>&1 || true
docker run --rm --network host -v "$work/zap:/zap/wrk:rw" -e ZAP_AUTH_HEADER_VALUE="Bearer $token" "$zap_image" \
  zap-api-scan.py -t /zap/wrk/openapi.yaml -f openapi -c rules.tsv > "$work/zap-api.log" 2>&1 || true
for s in baseline api; do
  npx --prefix "$repo/apps/api" tsx "$repo/apps/api/src/cli/to-junit.ts" zap "$work/zap-$s.log" "zap-$s" > "$out/zap-$s.xml"
done
echo "Wrote $(ls "$out" | wc -l) files to $out"
