# GET /api/auth/config

Public bootstrap, `Cache-Control: no-store` on every response including errors.

| Context | officeLocation | officeLocations | accessibleOfficeLocations |
| --- | --- | --- | --- |
| Anonymous/invalid/expired/deleted-local/revoked/pending/blocked | null | [] | [] |
| Approved unblocked ordinary user | Authorized selected summary or null | [] | Assigned id/key/name/isActive summaries |
| Current approved unblocked administrator | Selected summary or null | Full administration records | id/key/name/isActive summaries |

Sign-in method flags and existing approval/block status behavior remain. Session rejection clears profile, office and admin state; a previously resolved blocking flag may remain for existing account-status compatibility. No new endpoint.
