Fix this security scanner finding: $ARGUMENTS

Steps:

1. Explain the finding in two sentences: what is wrong and how it could be exploited here.
2. Find where in this repo it comes from, and propose the smallest fix. Wait for approval.
3. Write a test in `apps/api/test/security.test.ts` that fails before the fix.
4. Apply the fix. Run lint, typecheck and tests.
5. Add a row to the summary table and a short section in `docs/security-findings.md`.
6. If the finding is a false positive, do not change code. Draft the justification line for `.zap/rules.tsv` instead and explain why.
