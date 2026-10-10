# Responsive validation

Use a dedicated test Postgres/schema, never production data. Build the app and start `scripts/e2e-server.mjs` with explicit `TEST_DATABASE_URL`, then run Playwright with `PLAYWRIGHT_BASE_URL`.

- Browser regressions: 320/375/768/1280px; normal sign-in; menus, shopping, settings, administration; many past lunches; long account/contact/order text; each lunch phase; tall dialog scrolling and final action.
- Focused client tests cover changed shared behavior.
- Run `pwsh -File ./validate.ps1 all` and `full`, record evidence in tasks.md.

Automated browser geometry and interaction checks do not establish physical-device or screen-reader verification.
