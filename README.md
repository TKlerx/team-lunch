# Team Lunch

[![CI](https://github.com/TKlerx/team-lunch/actions/workflows/ci.yml/badge.svg)](https://github.com/TKlerx/team-lunch/actions/workflows/ci.yml)

Team Lunch is a collaborative lunch coordination app for teams. It helps a group pick a place to eat, collect everyone's order, and track delivery status in real time.

The app has three main phases:

1. Start a timed poll to choose a menu or restaurant.
2. Run a timed ordering round for the winning menu.
3. Track order placement and delivery until lunch arrives.

Everything stays synced across connected browsers through Server-Sent Events (SSE).

## End-User Guide

- See [USER_DOCUMENTATION.md](USER_DOCUMENTATION.md) for the user workflow and phase-by-phase CTAs.

## What It Includes

- Real-time poll voting
- Tie handling with extension or random winner selection
- Timed food ordering rounds
- Delivery tracking with ETA updates
- Menu management and JSON import
- Learned meal recommendations with safe, explore, and pre-vote guidance
- Anticipated like/dislike marks and onboarding seeds for cold start
- Shopping list support
- Multi-office support
- Optional local auth
- Optional Microsoft Entra SSO
- Optional Microsoft Graph email notifications

## Tech Stack

- React 18 + Vite + TypeScript
- Fastify + TypeScript
- Prisma ORM
- PostgreSQL by default
- SQLite option for lightweight local server/testing flows
- Vitest, Testing Library, Supertest, Playwright

## Prerequisites

- **Node.js** (v24 LTS recommended; v20+ for local tooling)
- **Python** (v3.10+) — used only for the semgrep security scanner
- **PowerShell** (v7+) — `pwsh` is used for setup and validation scripts ([install guide](https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell))
- **Docker** — for PostgreSQL (unless using SQLite)

Run `pwsh -File ./setup.ps1` to install all project dependencies automatically (npm packages, Prisma client, Python venv with semgrep).

## Quick Start

### Option A: Fastest Local Start with Docker

1. Clone the repo and run the setup script:

```bash
git clone https://github.com/TKlerx/team-lunch.git
cd team-lunch
pwsh -File ./setup.ps1
```

This installs npm packages, generates the Prisma client, and creates a Python venv with semgrep.

2. Create your local env file:

```bash
cp .env.example .env
```

3. Start PostgreSQL:

```bash
docker compose up db -d
```

4. Apply migrations:

```bash
npx prisma migrate dev
```

5. Start the app:

```bash
npm run dev
```

6. Open the app:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

### Option B: Backend-Only with SQLite

This is useful if you want to explore the backend quickly without running PostgreSQL.

```bash
git clone https://github.com/TKlerx/team-lunch.git
cd team-lunch
pwsh -File ./setup.ps1
cp .env.example .env
npm run dev:server:sqlite
```

### Option C: Full Stack in Docker

```bash
git clone https://github.com/TKlerx/team-lunch.git
cd team-lunch
cp .env.example .env
docker compose up --build
```

Then open `http://localhost:3000`.

### Production Deploy with Docker Compose

For a production-style deploy, configure `.env` and run:

```bash
pnpm deploy
```

This runs `scripts/deploy.sh`, which exports and prints build metadata, lists
Compose data volumes, builds the app and migrate images, starts the database,
verifies the target does not look like the wrong/empty database, creates a
PostgreSQL backup, runs Prisma pre-deploy verification, applies migrations,
restarts the app, and checks the database again.

Backups are written to `backups/postgres/` by default and pruned by count
(`BACKUP_KEEP_COUNT`, default `5`) and age (`KEEP_DAYS`, default `90`). For an
intentional fresh bootstrap, set `ALLOW_EMPTY_DATABASE_DEPLOY=true`.

Existing deployments that were initialized before the app was renamed may still
use the old `paiqo` database and PostgreSQL 16 data directory. Keep those values
in `.env` until you do a dump/restore major-version upgrade:

```env
POSTGRES_IMAGE="postgres:16-alpine"
POSTGRES_USER="paiqo"
POSTGRES_PASSWORD="paiqo"
POSTGRES_DB="paiqo"
POSTGRES_PGDATA="/var/lib/postgresql"
COMPOSE_DATABASE_URL="postgresql://paiqo:paiqo@db:5432/paiqo?schema=public"
```

## First-Time Setup

### Minimal Local Setup

For local development, these settings are enough in most cases:

```env
DATABASE_URL="postgresql://teamlunch:teamlunch@localhost:5433/teamlunch?schema=public"
AUTH_SESSION_SECRET="replace-with-a-long-random-secret-of-at-least-32-chars"
```

Generate a real `AUTH_SESSION_SECRET` before using the app outside throwaway local testing:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or with OpenSSL:

```bash
openssl rand -hex 32
```

If you want approval-gated local auth with a bootstrap admin:

```env
AUTH_ADMIN_EMAIL="admin@example.com"
AUTH_ADMIN_PASSWORD="change-me-please"
```

Then seed the admin:

```bash
npm run auth:seed
```

## Environment Variables

The repo ships a documented `.env.example`. The most important variables are:

### Mandatory for Most Setups

- `DATABASE_URL`: primary database connection string
- `AUTH_SESSION_SECRET`: required for auth cookies and local auth flows

### Common Optional Settings

- `PORT`: backend port used by the Fastify server in dev and production
- `VITE_PORT`: frontend dev-server port; mainly relevant in local development when Vite and the backend run as separate processes
- `DEFAULT_FOOD_SELECTION_DURATION_MINUTES`: optional global fallback for auto-started food selection; if unset or invalid, the app falls back to `30`
- `AUTH_ADMIN_EMAIL` and `AUTH_ADMIN_PASSWORD`: bootstrap local admin account

### Optional Build Metadata Settings

The app exposes `GET /api/version` and shows the same metadata on the Settings
page for support diagnostics.

- `APP_VERSION`: displayed app version, for example a release tag in production or `20260611.3` in staging
- `GIT_SHA`: deployed commit SHA
- `GIT_BRANCH`: deployed branch name
- `GIT_DIRTY`: `true` when the deployed worktree had local changes
- `BUILD_TIME`: UTC build/deploy timestamp

`pnpm deploy` sets these automatically from Git unless you override them in the
environment. In local dev, `/api/version` falls back to reading Git directly.

### Optional Path Prefix Settings

Use these only if you deploy the app under a subpath such as `/team-lunch`.

- `BASE_PATH`: backend/app path prefix
- `VITE_BASE_PATH`: frontend build-time counterpart of `BASE_PATH`

You usually want:

- root deployment:
  - `BASE_PATH=""`
  - `VITE_BASE_PATH=""`
  - app URL: `https://example.com/`
  - API URL: `https://example.com/api/health`
- subpath deployment:
  - `BASE_PATH="/team-lunch"`
  - `VITE_BASE_PATH="/team-lunch"`
  - app URL: `https://example.com/team-lunch/`
  - API URL: `https://example.com/team-lunch/api/health`

Why both exist:

- `BASE_PATH` tells the backend/router where the app lives
- `VITE_BASE_PATH` tells the frontend build where its JS/CSS/assets and client routes live
- They represent the same deployment path concept, but they are consumed by different runtimes:
  - Fastify reads `BASE_PATH` at runtime
  - Vite reads `VITE_BASE_PATH` when building the frontend

If you deploy at the site root, leave both empty.

### Optional SSO / Mail Settings

- `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_TENANT_ID`: enable Entra login
- `GRAPH_MAIL_SENDER`: enable Graph-based mail delivery

### Optional AI Meal Recommendation Settings

- `AI_RECOMMENDATION_ENDPOINT`, `AI_RECOMMENDATION_API_KEY`, `AI_RECOMMENDATION_MODEL`,
  `AI_RECOMMENDATION_PROVIDER`: enable AI-assisted explanations for "Recommend a
  meal". All four must be set or AI assistance stays disabled.
- The AI never picks or ranks items - ranking is always deterministic. AI only
  supplies short reason text for the items the deterministic ranker already
  selected.
- The same `AI_RECOMMENDATION_*` environment boundary is reused for menu-import
  feature gap filling; if AI tagging is configured, untagged imports can gain
  ingredient/style features automatically, otherwise imports still complete.
- Ranking is per person and content-based: items are tagged with ingredient and
  style features (e.g. chicken, thai, spicy), a taste profile is learned from
  each user's own history, and unrated menu items are scored by how well their
  features match flavors that user prefers - not just by exact dishes they
  ordered before. The profile uses both explicit star ratings and implicit
  signal (simply ordering an item is a mild positive vote for its features), so
  it still works when people rarely rate.
- Deterministic meal recommendations (`POST
  /api/food-selections/:id/recommendations`) always work without these
  variables. When AI is requested but not configured, unavailable, or times out
  (2s), the response falls back to `source: "deterministic_fallback"` with a
  warning, never an error.
- AI payloads sent to the provider only include item/menu names, ranks, scores,
  signal categories, and ingredient preferences. Names, emails, actor keys, order
  notes, and feedback remarks are never sent.

#### Using Azure OpenAI

Set `AI_RECOMMENDATION_PROVIDER="azure-openai"` to use an Azure OpenAI chat
deployment directly:

- `AI_RECOMMENDATION_ENDPOINT`: full Azure OpenAI chat-completions URL, e.g.
  `https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-08-01-preview`
- `AI_RECOMMENDATION_API_KEY`: Azure OpenAI key, sent as the `api-key` header
- `AI_RECOMMENDATION_MODEL`: informational (the deployment in the endpoint URL
  determines the actual model)

In this mode the app sends a chat-completion request with
`response_format: { type: "json_object" }` and a system prompt instructing the
model to return `{"explanations":[{"itemName":"...","reason":"..."}]}` based
only on the sanitized item/preference data above. Any other
`AI_RECOMMENDATION_PROVIDER` value uses the generic custom-endpoint contract
(`Authorization: Bearer` header, `{model, items, preferences}` body, expects
`{explanations:[...]}` directly).

## Development Commands

```bash
npm run dev                 # server + client
npm run dev:server          # backend only
npm run dev:client          # frontend only
npm run dev:server:sqlite   # backend with SQLite
npm run build               # production build
npm start                   # run built app
```

## Validation

```bash
npm run typecheck
npm run lint
npm test
./validate.ps1
```

Useful validation modes:

```powershell
./validate.ps1 quick
./validate.ps1 precommit
./validate.ps1 test
./validate.ps1 quality
./validate.ps1 full
```

`./validate.ps1 full` builds a local `team-lunch:trivy-scan` image and scans it
with the official Trivy container image pinned by digest. Override the scanner
image with `TRIVY_IMAGE` only when intentionally updating the pinned scanner, and
override the scan target with `TRIVY_SCAN_IMAGE` if needed.

## Authentication Modes

### Nickname-only

The simplest mode. Users identify themselves with a nickname stored in local storage.

### Local Auth

Enable local sign-in by setting:

```env
AUTH_SESSION_SECRET="replace-with-a-long-random-secret"
AUTH_ADMIN_EMAIL="admin@example.com"
AUTH_ADMIN_PASSWORD="change-me-please"
```

Then run:

```bash
npm run auth:seed
```

### Entra SSO

Enable Microsoft Entra backend auth with:

```env
APP_PUBLIC_URL="https://lunch.example.com"
ENTRA_CLIENT_ID="your-app-client-id"
ENTRA_CLIENT_SECRET="your-app-client-secret"
ENTRA_TENANT_ID="your-tenant-id"
```

Optional:

```env
ENTRA_REDIRECT_URI="https://lunch.example.com/team-lunch/api/auth/entra/callback"
GRAPH_MAIL_SENDER="sender@example.com"
```

If Entra is not configured, the app can still run without Microsoft sign-in.
The login UI disables the Microsoft button and continues to support other
available auth modes. If authentication config cannot be loaded at all, the
app shows an authentication error instead of falling back to open access.

## Running Behind a Reverse Proxy

For subpath deployments, set both values to the same path prefix:

```env
BASE_PATH="/team-lunch"
VITE_BASE_PATH="/team-lunch"
APP_PUBLIC_URL="https://lunch.example.com"
```

This produces URLs like:

- app: `https://lunch.example.com/team-lunch/`
- menus page: `https://lunch.example.com/team-lunch/menus`
- API health check: `https://lunch.example.com/team-lunch/api/health`

An example Nginx config is included at `deploy/nginx/team-lunch.conf`.

## Project Structure

```text
src/
  client/   React frontend
  server/   Fastify backend
  lib/      shared types
prisma/     Prisma schema and migrations
tests/      client and server tests
specs/      planning docs and optional continuity snapshots
```

## Notes

- Server tests use a separate schema by default via `TEST_DATABASE_SCHEMA`.
- If PostgreSQL is unavailable, some local flows can use SQLite instead.
- Browser sessions and local storage keys were renamed during open-source cleanup, so older local sessions may need a fresh login.
