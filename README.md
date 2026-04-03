# Team Lunch

Team Lunch is a collaborative lunch coordination app for teams. It helps a group pick a place to eat, collect everyone's order, and track delivery status in real time.

The app has three main phases:

1. Start a timed poll to choose a menu or restaurant.
2. Run a timed ordering round for the winning menu.
3. Track order placement and delivery until lunch arrives.

Everything stays synced across connected browsers through Server-Sent Events (SSE).

## What It Includes

- Real-time poll voting
- Tie handling with extension or random winner selection
- Timed food ordering rounds
- Delivery tracking with ETA updates
- Menu management and JSON import
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

## Quick Start

### Option A: Fastest Local Start with Docker

1. Clone the repo and install dependencies:

```bash
git clone https://github.com/TKlerx/team-lunch.git
cd team-lunch
npm install
```

2. Create your local env file:

```bash
cp .env.example .env
```

3. Start PostgreSQL:

```bash
docker compose up db -d
```

4. Generate Prisma client and apply migrations:

```bash
npx prisma generate
npm run prisma:migrate:dev
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
npm install
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
./validate.ps1 test
./validate.ps1 quality
./validate.ps1 full
```

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
specs/      planning and continuity docs
```

## Notes

- Server tests use a separate schema by default via `TEST_DATABASE_SCHEMA`.
- If PostgreSQL is unavailable, some local flows can use SQLite instead.
- Browser sessions and local storage keys were renamed during open-source cleanup, so older local sessions may need a fresh login.
