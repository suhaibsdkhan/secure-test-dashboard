# Sending test results to the dashboard

The dashboard accepts **JUnit XML**, which almost every test runner can write:

| Runner | Flag |
|---|---|
| pytest (incl. Selenium, Playwright for Python) | `pytest --junitxml=results.xml` |
| Playwright (Node) | `npx playwright test --reporter=junit` with `PLAYWRIGHT_JUNIT_OUTPUT_NAME=results.xml` |
| Jest | `jest-junit` reporter |
| Vitest | `vitest run --reporter=junit --outputFile.junit=results.xml` |
| Cypress | `--reporter junit --reporter-options mochaFile=results.xml` |
| Maven / TestNG / JUnit | Surefire writes `target/surefire-reports/*.xml` |
| Robot Framework | `robot --xunit results.xml` |

## Upload

```bash
curl -fsS -X POST "$DASHBOARD_URL/api/runs?project=my-tests&branch=main&commit=$GIT_SHA" \
  -H "Authorization: Bearer $DASHBOARD_INGEST_TOKEN" \
  -H "Content-Type: application/xml" \
  --data-binary @results.xml
```

- `project`: letters, digits, `. _ / -`, up to 100 characters. Each project gets its own trend.
- `branch` (default `main`) and `commit` (a git SHA) are optional.
- Limits: 5 MB body, 20,000 test cases, 30 uploads per minute per IP. DTDs are rejected.

The token is in AWS Secrets Manager once deployed:

```bash
aws secretsmanager get-secret-value --secret-id test-dashboard-ingest-token --query SecretString --output text
```

## From another repository's GitHub Actions

Add a `DASHBOARD_URL` repository variable and a `DASHBOARD_INGEST_TOKEN` secret to that
repo, then append to its test job:

```yaml
      - name: Run tests
        run: pytest --junitxml=results.xml

      - name: Publish results to the dashboard
        if: always() && github.ref == 'refs/heads/main'   # upload failures too
        env:
          DASHBOARD_URL: ${{ vars.DASHBOARD_URL }}
          TOKEN: ${{ secrets.DASHBOARD_INGEST_TOKEN }}
        run: |
          curl -fsS -X POST "$DASHBOARD_URL/api/runs?project=${{ github.event.repository.name }}&branch=${{ github.ref_name }}&commit=$GITHUB_SHA" \
            -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/xml" \
            --data-binary @results.xml
```

If a runner writes several XML files (e.g. Surefire), upload each one, or merge them into
one `<testsuites>` document first.
