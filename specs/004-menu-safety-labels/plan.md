# Implementation Plan: Menu Safety Labels

**Branch**: `004-menu-safety-labels` | **Date**: 2026-07-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-menu-safety-labels/spec.md`

## Summary

Add independent allergen and additive label lists to menu items. Extend the existing JSON import contract, manual menu management, shared item responses, and food-selection UI so tags remain preference labels while safety labels are visually distinct and can temporarily hide matching dishes.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM), Node.js 24 LTS

**Primary Dependencies**: Existing Fastify backend, React 18 + Vite client, Prisma 7 with PostgreSQL driver adapter. No new dependency.

**Storage**: Add PostgreSQL-backed string-list fields to `MenuItem` through `prisma/schema.prisma` and one new Prisma migration.

**Testing**: Existing Vitest server service/route tests and Vitest + Testing Library client tests. Extend the prompt-copy assertion because the prompt changes.

**Target Platform**: Browser SPA served by Fastify; Windows-first PowerShell tooling.

**Project Type**: Single-package full-stack web app.

**Performance Goals**: No additional request or event round trip. Food-selection exclusion filtering stays local and linear in the currently displayed menu-item list.

**Constraints**: Preserve office scoping and current authentication; all labels normalize to lowercase, trim, deduplicate, and cap at 60 characters; import remains atomic; Settings warnings and recommendation features remain unchanged; exclusions are never persisted or broadcast.

**Scale/Scope**: One schema migration; existing shared types, menu service/routes/client API, import schema/prompt, menu-management view, food-selection view, and focused tests. No new route, service, dependency, SSE event, persisted entity, or profile setting.

## Constitution Check

| Principle | Design result |
|---|---|
| Thin Routes, Service-Owned Logic | Pass — existing menu routes forward the expanded shared payload to the menu service; validation/persistence stays in the service. |
| Single Prisma Client | Pass — all storage remains through `src/server/db.ts`. |
| Shared Types, No Duplication | Pass — expand `MenuItem` and create/update request types in `src/lib/types.ts`; client API consumes them. |
| Realtime via SSE | Pass — existing item/menu update events carry the expanded item shapes; no silent shared mutation or new event required. |
| Tests Are Mandatory | Pass — server import/CRUD and client display/filter tests ship in the same task. |
| Database Rules | Pass — one forward-only migration; no new model means no test cleanup change. |

**Post-design check**: Pass. The design adds no constitution violation and needs no complexity justification.

## Project Structure

### Documentation

```text
specs/004-menu-safety-labels/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── menu-items.md
└── tasks.md                 # created in the next phase
```

### Source changes

```text
import/menu/
├── import-menu-schema.json       # accept safety-label arrays
└── import-menu-prompt.txt        # extract separate tags/allergens/additives

prisma/
├── schema.prisma                 # MenuItem allergen/additive lists
└── migrations/<timestamp>_menu_item_safety_labels/migration.sql

src/
├── lib/
│   ├── types.ts                  # shared item and create/update shapes
│   └── menuItemTags.ts           # shared label normalization/validation
├── server/
│   ├── routes/menus.ts           # forward expanded item payloads only
│   └── services/menu.ts          # validate, persist, format, import labels
└── client/
    ├── api.ts                    # use shared expanded request payload
    ├── pages/ManageMenus.tsx     # edit and distinguish label groups
    └── components/FoodSelectionActiveView.tsx
                                  # show label groups and local exclusions

tests/
├── server/
│   ├── menu-service.test.ts      # normalization, CRUD, atomic import
│   └── menu-routes.test.ts       # request validation and response shape
└── client/
    ├── ManageMenus.test.tsx      # edit/display and import-prompt contract
    └── FoodSelectionActiveView.test.tsx
                                  # exclusions, tabs, empty result, no persistence
```

**Structure Decision**: Extend the established menu feature paths. Keep recommendation tags in `MenuItemFeature`; safety lists live directly on `MenuItem` and are formatted with the existing menu item response.

## Implementation Sequence

1. Add the migration and shared label normalization/types.
2. Extend menu CRUD, formatters, import parser, replacement write, import schema, and extraction prompt atomically.
3. Extend manual menu management and existing menu data consumers to display/edit distinct label groups.
4. Add temporary local allergen/additive exclusions in Food Selection, composing them with existing tag/search/tab filters.
5. Add focused server/client regression tests, run the migration before server tests, then run the full validation gate.

## Complexity Tracking

No constitution violations or additional complexity required.
