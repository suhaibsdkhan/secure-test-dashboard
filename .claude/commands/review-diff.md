Review the current uncommitted changes (`git diff` and `git diff --staged`) as a strict senior reviewer who did not write them.

Check, and report findings as a numbered list with file:line for each:

1. Does the change do what was asked: $ARGUMENTS
2. Logic errors the tests would not catch: off-by-one, wrong comparison, null/undefined paths, wrong default.
3. Inputs: is every new request input validated with zod? Any path where bad input reaches the database?
4. Errors: could any response leak an internal message, stack trace or SQL error?
5. Secrets and data: any token, password, connection string or personal data in code, tests or logs?
6. Retries and duplicates: what happens if the same request arrives twice?
7. Tests: is each new behaviour covered, including the failure cases? Name any missing test.
8. Scope: any change to files unrelated to the task?

Do not edit files. If everything passes, say so in one line.
