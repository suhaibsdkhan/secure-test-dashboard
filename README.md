# Secure Test Results Dashboard

A full-stack dashboard for automated test results: upload a JUnit XML report from any test
suite's CI job and see pass-rate trends, flaky tests, slow tests and failure output. Built as
the companion to a test-automation project, so that project's CI publishes its results here.

The focus is security: the CI/CD pipeline runs **OWASP ZAP** (passive baseline and an
authenticated active API scan), **dependency scanning** (npm audit, Trivy, GitHub dependency
review), a **container image scan** and an **infrastructure-as-code scan** as blocking gates,
and deploys to **AWS with Terraform**. What those scans found and how each finding was fixed
is written up in **[docs/security-findings.md](docs/security-findings.md)**.

![Dashboard](docs/dashboard.png)

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
npm run seed            # upload two weeks of sample results
open http://localhost:8080
```

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
GitHub Actions step. This repo's own CI uploads its test results too.

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
samples         Example JUnit reports
```
