# CLAUDE.md — secure-test-dashboard

Dashboard for JUnit test and security-scan results. Node 22 + TypeScript API, React 19 web app,
PostgreSQL 16, deployed to AWS (ECS Fargate) with Terraform. Security scanning is a blocking gate,
so treat security regressions as build failures.

## Layout

- `apps/api` — Express 5 API. `src/routes` (HTTP), `src/lib` (JUnit and scan parsing, auth),
  `src/db` (queries, migrations runner), `migrations/` (plain SQL, numbered), `test/` (Vitest).
- `apps/web` — React + Vite. Charts are hand-built SVG; no chart library.
- `infra/terraform` — AWS infrastructure. Do not run `terraform apply`.
- `.github/workflows` — `ci.yml`, `security.yml`, `deploy.yml`.
- `docs/security-findings.md` — every scanner finding and its fix. Update it when you fix one.

## Commands

- Install: `npm ci`
- Lint / typecheck: `npm run lint && npm run typecheck`
- Unit tests: `npm test`
- Integration tests need Postgres: `TEST_DATABASE_URL=postgres://dash:dash@localhost:5432/dash_test npm test`
- Local stack: `docker compose up --build`, then `npm run seed`

## How we work

1. For anything bigger than a one-file fix, propose a short plan first and wait for approval.
2. One small change per step. Each step should be a diff that can be read in one sitting and
   reverted on its own.
3. Write or update tests in the same step as the code. A bug fix starts with a failing test.
4. Before saying a step is done, run lint, typecheck and tests, and report the results.
5. End each step with a 3–5 line summary: what changed, why, and anything you were unsure about.

## Code rules

- Validate every request input with zod at the route. Reject with 400 and `z.flattenError`.
- Never return internal error messages, stack traces or SQL errors to the client. Log them; return
  a generic message. `test/security.test.ts` pins this.
- Keep the security headers in `src/app.ts` (helmet + hand-written CSP). No `'unsafe-inline'`.
- Unknown routes return a real 404, not the SPA's `index.html`.
- Token comparison stays constant-time (`src/lib/auth.ts`). Don't replace it with `===`.
- New database changes go in a new numbered migration. Never edit an existing migration.
- SQL uses parameterized queries only. No string-built SQL.
- Pin GitHub Actions to commit SHAs.

## Never

- Read or print `.env`, `*.tfvars`, or anything in a secrets store. Use `.env.example` for shape.
- Put real tokens, passwords or personal data in code, tests, fixtures or commit messages.
- Add a dependency without saying why and checking it isn't already covered by an existing one.
- Disable a ZAP rule without a justification line in `.zap/rules.tsv`.
- Push, force-push, or run `terraform apply`. A human does those.
