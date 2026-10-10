# Responsive validation

Use a dedicated test Postgres/schema, never production data. Build the app and start `scripts/e2e-server.mjs` with explicit `TEST_DATABASE_URL`, then run Playwright with `PLAYWRIGHT_BASE_URL`.

- Browser regressions: 320/375/768/1280px; normal sign-in; menus, shopping, settings, administration; many past lunches; long account/contact/order text; each lunch phase; tall dialog scrolling and final action.
- Check inner controls and grid children as well as outer scroll widths; hidden overflow can otherwise make a broken layout pass. Phone touch tests submit an individual Add/Remove and completed-order rating/remark, check 44px actions and usable feedback-field width, and cover landscape resizing. Screenshot artifacts in `test-results/` are for visual inspection, not pixel baselines.
- For WebKit, serve the production test app through local HTTPS (for example port 8443) and use `ignoreHTTPSErrors` only for the local self-signed test certificate. Keep production Secure cookies unchanged; WebKit does not share Chromium's HTTP loopback-cookie behavior.
- Focused client tests cover changed shared behavior.
- Run `pwsh -File ./validate.ps1 all` and `full`, record evidence in tasks.md.

Automated browser geometry and interaction checks do not establish physical-device or screen-reader verification.
