# ZAP scan rules

`rules.tsv` is passed to `zap-baseline.py` and `zap-api-scan.py` with `-c`. Every rule not listed
here fails the Security workflow when it raises a warning. Each exception and why:

| Rule | Action | Reason |
|---|---|---|
| 10027 Suspicious Comments | IGNORE | False positive: matches `select` in the minified React bundle (a JSX `<select>` and a library URL comment). |
| 10109 Modern Web Application | IGNORE | Informational. It suggests the Ajax spider, which the workflow already runs (`-j`). |
| 100001 Unexpected Content-Type | IGNORE | Only `/` remains, which is the HTML dashboard itself. Soft-404 regressions are covered by `apps/api/test/security.test.ts`. |
| 10049 Content Cacheability (Non-Storable Content) | IGNORE | Informational. API responses are deliberately `Cache-Control: no-store` because they're live data; fingerprinted assets are cached for a year. |
| 90022 Application Error Disclosure | OUT OF SCOPE for `/api/runs/{id}` only | That endpoint's job is to return test failure output (stack traces from the test suite being reported on). It's stored data, rendered as text. Real server errors are generic; see `security.test.ts`. |
