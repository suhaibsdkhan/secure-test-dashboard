# Secure Test Results Dashboard

A full-stack dashboard for automated test and security-scan results: upload a JUnit XML
report from any CI job and see pass-rate trends, flaky tests, slow tests and failure output.

It tracks two projects. The first is
**[Harbour Bank](https://github.com/suhaibsdkhan/Harbour-bank-qe-framework)**, a Spring Boot
banking API with a QE framework (JUnit 5, Cucumber, Rest Assured, Playwright, Selenium,
Postman/Newman): its CI merges the Surefire reports (unit and end-to-end) and uploads them, plus the Newman results,
to this dashboard on every run. The second is this dashboard itself, which monitors its own
pipeline: every push uploads this repo's unit tests, OWASP ZAP scans and
Trivy image scan (converted to JUnit, one test case per rule or finding), so the dashboard
shows its own security posture over time.

The focus is security: the CI/CD pipeline runs **OWASP ZAP** (passive baseline and an
authenticated active API scan), **dependency scanning** (npm audit, Trivy, GitHub dependency
review), a **container image scan** and an **infrastructure-as-code scan** as blocking gates,
and deploys to **AWS with Terraform**. What those scans found and how each finding was fixed
is written up in **[docs/security-findings.md](docs/security-findings.md)**.

![All projects: Harbour Bank's end-to-end and Postman suites next to this repo's own tests and scans](docs/projects.png)

![The ZAP baseline suite on the dashboard: four failing checks until the security fixes landed, then clean](docs/dashboard.png)

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router; hand-built SVG charts |
| API | Node 22, TypeScript, Express 5, zod, helmet, express-rate-limit |
| Database | PostgreSQL 16 (plain SQL migrations) |
| Container | Multi-stage Docker build, distroless non-root runtime |
| Infra | Terraform: VPC, ECS Fargate, ALB, RDS, ECR, Secrets Manager, CloudFront, WAF |
| CI/CD | GitHub Actions: tests, ZAP, Trivy, npm audit, dependency review, OIDC deploy |

## Run it locally

```bash
cp .env.example .env    # then put random values in it: openssl rand -hex 32
docker compose up --build
npm run seed            # load three weeks of demo history
open http://localhost:8080
```

The demo history is built from real results, not invented ones:

- `samples/harbour/` is a real run of the Harbour Bank suites: its 12 unit tests, 67
  JUnit and Cucumber end-to-end tests (API, SQL, Playwright, Selenium, accessibility) merged
  from Surefire, and the 29-assertion Newman collection. The seed replays it as a nightly run.
- `samples/pipeline/` holds this repo's actual test, ZAP and Trivy output for three commits
  (before the security fixes, after them, and today), captured with `scripts/scan-commit.sh`.
  The seed replays them over three weeks with varied timings, so the security suites show the
  real before-and-after.

For development with hot reload: `npm install`, point the API at any Postgres with
`DATABASE_URL` and set `INGEST_TOKEN` (32+ characters), then `npm run dev:api` and
`npm run dev:web` (Vite on :5173 proxies `/api` to :8080).

### Tests

```bash
npm test                                                   # unit tests
TEST_DATABASE_URL=postgres://user:pass@localhost/db npm test   # plus API integration tests
npm run lint && npm run typecheck
```

`apps/api/test/security.test.ts` pins each fixed ZAP finding (headers, soft 404s, error
leakage, rate limits) so a regression fails in seconds, before the scan runs.

## Sending results

```bash
curl -X POST "$URL/api/runs?project=my-tests&branch=main&commit=$SHA" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/xml" \
  --data-binary @results.xml
```

Works with pytest, Playwright, Selenium, Jest, Vitest, Cypress, JUnit/TestNG and anything
else that writes JUnit XML. See [docs/ingest.md](docs/ingest.md) for a ready-to-paste
GitHub Actions step. ZAP and Trivy output is converted with
`apps/api/src/cli/to-junit.ts`.

## Pipeline

| Workflow | What runs | Blocks on |
|---|---|---|
| `ci.yml` | lint, typecheck, unit + integration tests (Postgres service), build, `terraform validate` | any failure |
| `security.yml` | npm audit, Trivy (lockfile, secrets, Terraform, Dockerfile), dependency review on PRs, Trivy image scan, ZAP baseline + ZAP API scan against the running stack | high/critical fixable CVEs, any IaC or secret finding, any ZAP warning not justified in [.zap/rules.tsv](.zap/README.md) |
| `deploy.yml` | build, push to ECR, roll ECS; runs after `security.yml` passes on `main` | failed health checks (auto rollback) |

Actions are pinned to commit SHAs, and results go to GitHub code scanning as SARIF. The
security workflow also runs weekly to catch CVEs published after the last change.

## Deploy

See [docs/deploy.md](docs/deploy.md). Short version: `terraform apply` in `infra/terraform`,
push the first image, set two GitHub variables, and every green push to `main` deploys.

## Layout

```
apps/api        Express API, migrations, tests, OpenAPI spec (used by the ZAP API scan)
apps/web        React dashboard
infra/terraform AWS infrastructure
.github         CI, security and deploy workflows; Dependabot
.zap            ZAP rule exceptions, each justified
docs            Security write-up, deploy and ingest guides
samples         Example JUnit reports; harbour/ and pipeline/ hold real results used by the seed
scripts         Demo seeding and per-commit scan capture
```
