# Security findings and fixes

What the pipeline's scanners found in this app, and what changed because of it. Every
finding below came from an actual scan of this codebase (OWASP ZAP 2.17.0, Trivy 0.74.0);
the before and after states are separate commits, so the diff for each fix is in the history.

## Summary

| # | Found by | Finding | Severity | Status |
|---|---|---|---|---|
| 1 | ZAP baseline (10038) | No Content-Security-Policy | Medium | Fixed |
| 2 | ZAP baseline (10020) | No anti-clickjacking header | Medium | Fixed |
| 3 | ZAP baseline (10021) | No `X-Content-Type-Options` | Low | Fixed |
| 4 | ZAP baseline (10037) | `X-Powered-By: Express` leaks the framework | Low | Fixed |
| 5 | ZAP API scan (100001) | Unknown URLs returned `200` + the HTML app (soft 404), and unknown POSTs returned Express's HTML error page | Low | Fixed |
| 6 | Trivy image scan | Runtime image (distroless Debian 12) shipped `libssl3` with 1 critical and 5 high CVEs, e.g. CVE-2026-31789 | Critical | Fixed |
| 7 | Trivy IaC scan (AWS-0054) | Load balancer served plain HTTP (the upload token would cross the internet unencrypted) | Critical | Fixed |
| 8 | Trivy IaC scan (AWS-0011) | Public entry point without a WAF | High | Fixed |
| 9 | Trivy IaC scan (AWS-0178) | No VPC flow logs | Medium | Fixed |
| 10 | Code review | 500 responses echoed internal error messages (e.g. SQL errors) | Medium | Fixed |
| 11 | Code review | No rate limiting; the upload token could be brute-forced | Medium | Fixed |

Scanner noise that was investigated and not "fixed": see [False positives](#false-positives-and-accepted-risks).

## Details

### 1–4. Missing security headers (ZAP baseline)

The first scan of the plain Express app flagged every response: no CSP, no
`X-Frame-Options`, no `nosniff`, and an `X-Powered-By: Express` banner.

**Fix** (`apps/api/src/app.ts`): `helmet` with a hand-written CSP rather than its defaults:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

There is no `'unsafe-inline'` anywhere. That works because Vite emits the React app as
external JS and CSS files, and React sets dynamic styles (the chart tooltip position)
through the CSSOM, which CSP allows. I verified the page in Chromium with zero CSP
violations in the console. `X-Frame-Options: DENY` covers old browsers that ignore
`frame-ancestors`, and `app.disable("x-powered-by")` drops the banner.

### 5. Soft 404s (ZAP API scan)

The SPA fallback served `index.html` with `200 OK` for *any* path, so `/sitemap.xml`,
`/robots.txt` and ZAP's cloud-metadata probes (`/latest/meta-data/`) all "succeeded".
Unknown POSTs fell through to Express's default HTML error page.

**Fix:** the shell is served only for the routes the client actually has (`/` and
`/runs/:id`), everything else gets a JSON `404`, and there's a real `robots.txt`.

### 6. Vulnerable OpenSSL in the base image (Trivy)

The app's own npm dependencies were clean (`npm audit`: 0), but the image scan found
`libssl3 3.0.18` in `gcr.io/distroless/nodejs22-debian12` with 1 critical and 5 high CVEs
that had fixes available upstream.

**Fix:** moved the runtime to `gcr.io/distroless/nodejs22-debian13`: 0 high/critical.
The image was already distroless (no shell or package manager) and non-root; Dependabot
now watches the base image, and the weekly scheduled scan catches new CVEs in images that
haven't changed.

### 7–9. Infrastructure misconfigurations (Trivy IaC)

- **Plain HTTP (AWS-0054, critical).** Without a custom domain there is no certificate
  for the load balancer. Rather than accept HTTP, the Terraform now puts CloudFront in
  front: viewers get HTTPS on the `*.cloudfront.net` name with AWS's certificate. The load
  balancer only accepts CloudFront's IP ranges (the managed prefix list) *and* requires a
  secret `X-Origin-Verify` header that CloudFront adds, so it can't be reached around
  CloudFront. With your own domain (`certificate_arn`), the ALB terminates TLS 1.3 directly.
- **No WAF (AWS-0011, high).** Added AWS WAF with the AWS managed Common, Known Bad
  Inputs and IP Reputation rule groups plus a per-IP rate limit. The Common rule set's
  8 KB body limit would have blocked every JUnit upload, so that one rule counts
  instead of blocking, a real-world tuning step.
- **No flow logs (AWS-0178).** Added VPC flow logs for rejected traffic.

### 10. Error messages leaking internals (code review)

The first error handler did `res.status(500).json({ error: err.message })`, so a database
error like `relation "x" does not exist` went straight to the client. Now 5xx responses
say only `internal error` (the detail goes to the server log), and 4xx responses keep
only messages the framework marks safe to expose. A test forces a DB failure and asserts
the body.

### 11. No rate limiting (code review)

Nothing stopped someone guessing the upload token. Now uploads are limited to 30/min per IP
and reads to 300/min, keyed on the real client IP behind CloudFront and the ALB
(`trust proxy` set to the number of proxies, so a spoofed `X-Forwarded-For` doesn't
help). The token check itself compares SHA-256 digests with `timingSafeEqual`.

An interesting side effect: the first API scan after adding limits came back mostly
`429 Too Many Requests`, meaning the active scan had quietly stopped testing anything.
The ZAP job now raises the limits for the throwaway scan environment only, and 429s
return JSON.

## Designed in from the start

These never showed up as findings because they were built before the first scan:

- **XXE / billion laughs:** uploads are XML, so the parser rejects any `DOCTYPE` or `ENTITY`
  declaration before parsing (tested with an XXE payload), caps the report at 20,000
  test cases and the body at 5 MB, and checks the token *before* reading the body.
- **SQL injection:** every query is parameterised, including the batched insert.
- **Stored XSS:** test names and failure output come from uploaded files, so they're untrusted.
  React escapes them, and a test renders an `<img onerror>` / `<script>` payload and
  asserts no element is created.
- **Input validation:** zod schemas for every query parameter (project slug, git SHA,
  pagination bounds), and the UUID is checked before hitting the database.
- **Secrets:** RDS generates and rotates the DB password in Secrets Manager; ECS injects it
  at start. No AWS keys in GitHub: deploys use OIDC, limited to the `main` branch.
- **Container:** distroless, non-root (UID 65532), read-only root filesystem, all Linux
  capabilities dropped.
- **Database:** private subnets with no internet route, encrypted storage, `rds.force_ssl`,
  and the app verifies the RDS certificate against the AWS CA bundle.

## False positives and accepted risks

| Item | Decision |
|---|---|
| ZAP 10027 Suspicious Comments | False positive: the word `select` in the minified React bundle. Ignored in `.zap/rules.tsv`. |
| ZAP 90022 Application Error Disclosure on `/api/runs/{id}` | False positive: returning test stack traces is that endpoint's purpose. Scoped out for that path only. |
| Trivy AWS-0053 Public load balancer | It's the front door; in CloudFront mode it admits CloudFront only. |
| Trivy AWS-0104 Egress to 0.0.0.0/0 on 443 | Needed for ECR, Secrets Manager and CloudWatch without a NAT gateway. VPC endpoints would remove it for about US$7/month each. |
| Trivy AWS-0176 RDS IAM auth off | The app uses the RDS-managed, rotated password. |
| Trivy AWS-0177 RDS deletion protection | A variable, off by default so the demo can be torn down. |
| Trivy AWS-0010 CloudFront access logs | Off to avoid an extra S3 bucket in the demo. |
| CloudFront to ALB hop is HTTP | Residual risk in no-domain mode. With a domain and `certificate_arn`, TLS runs end to end. |

Each accepted Trivy item has a `#trivy:ignore` comment with the reason next to the resource.
