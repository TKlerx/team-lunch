# Spec: User Identity (Nickname)

## Topic of Concern
The identity system handles how a user is recognized across the app without any formal user accounts or authentication.

## Requirements

### First Visit
- On the very first visit to the app the user is presented with a modal/overlay before any other UI is shown.
- The modal asks the user to choose a nickname (free text, 1–30 characters, trimmed, non-empty).
- The modal cannot be dismissed without providing a valid nickname.
- The nickname is stored in the browser's `localStorage` under the key `team_lunch_nickname`.

### Subsequent Visits
- If `team_lunch_nickname` exists in `localStorage`, the modal is skipped entirely.
- The stored nickname is used automatically as the user's identity for the current session.

### Nickname Display
- The user's current nickname is always visible in the app header/navigation bar.
- The user can click their nickname at any time to open a rename dialog.
- Renaming follows the same validation rules as the first-visit modal.
- Renaming only updates `localStorage`; it does not retroactively change any persisted data (e.g. already submitted votes or food orders keep the old nickname at time of submission).

### Validation Rules
- Minimum length: 1 character (after trimming whitespace)
- Maximum length: 30 characters
- Allowed characters: any printable characters (Unicode-safe)
- Duplicate nicknames are allowed — the app does not enforce uniqueness

### No Backend Involvement
- Nicknames are client-side only (localStorage).
- The nickname is sent as a plain string in API request bodies whenever the backend needs to attribute an action to a user (e.g. casting a vote, placing a food order).
- The backend never stores a "user" entity; it stores only the nickname string alongside the relevant domain record.

## Out of Scope
- Authentication, passwords, sessions, or tokens.
- Enforcing nickname uniqueness.
- Nickname history or audit trail.
