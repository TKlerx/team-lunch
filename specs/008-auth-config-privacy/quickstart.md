# Validation

Use disposable PostgreSQL with explicit TEST_DATABASE_URL, TEST_DATABASE_SCHEMA and test-only AUTH_SESSION_SECRET. Never use production credentials or mutate deployed data.

1. Run focused server auth-config, approval, hardening and multi-office suites.
2. Inspect real local login followed by configuration: sign-in still works and office choices reflect access. Server regressions exercise ordinary multi-office users and admin office settings.
3. Run `validate.ps1 full` (includes all quality gates, coverage, Trivy and existing Playwright real-login smoke coverage plus the client office-switching regression) and record evidence in tasks.md.
4. Anonymous/invalid/revoked/error responses must have no-store and no office fields; ordinary-user summaries must have exactly the four permitted keys.
