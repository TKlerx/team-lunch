# Research

- Decision: guard office projection only after session existence, local-account existence and session-version validation. Clear resolved office/admin/profile state on validation failure. Rationale: the current catch retains approval state from before a rejected version check. Preserve only existing approval-required/blocked flags needed by account status behavior. Alternative: merely filter anonymous office arrays leaves selected-office and stale-admin leaks.
- Decision: ordinary users reuse authorization service office summaries; administrators alone load full office records. Rationale: AuthGate already selects these two contracts, and header/settings require only id/key/name/isActive. Alternative: querying all offices then filtering adds unnecessary access and work.
- Decision: set no-store before the route's try/catch. Rationale: ordinary, degraded and error responses must have identical cache policy.
- Read-only research delegation confirmed client compatibility and the existing stale blocked-cookie regression. Preserve blocked screen flags without any office/admin state.
- Health/version metadata policy and sign-in callback behavior remain outside this confirmed office-disclosure fix.
