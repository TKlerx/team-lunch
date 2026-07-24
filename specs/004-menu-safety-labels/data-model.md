# Data Model: Menu Safety Labels

## `MenuItem` additions

| Field | Shape | Required | Default | Rules |
|---|---|---:|---|---|
| `allergens` | ordered list of text labels | Yes | empty list | Each value is trimmed, lowercase, unique within the list, and at most 60 characters. |
| `additives` | ordered list of text labels | Yes | empty list | Each value is trimmed, lowercase, unique within the list, and at most 60 characters. |

The lists are independent from `MenuItemFeature` and its provenance. They are scoped by their owning `MenuItem`, cascade with it, and require no foreign keys or test-cleanup entries.

## Shared response shape

Every returned `MenuItem` gains:

```ts
{
  allergens: string[];
  additives: string[];
}
```

Existing items migrate to two empty lists. Item order is deterministic after normalization so displayed badges and filter choices remain stable.

## Write rules

| Flow | Missing list | Supplied list | Persistence effect |
|---|---|---|---|
| Create item | empty list | normalize before save | save both lists with the new item |
| Update item | preserve existing list when field omitted | normalize before save | update only supplied lists |
| Import item | empty list | normalize during full-payload validation | replace item lists atomically with the imported menu |

## Lifecycle

1. Import or manual write validates item core fields and label lists.
2. A successful import replaces all menu items and their safety labels together.
3. A menu item response exposes the three separate label sets: `tags`, `allergens`, and `additives`.
4. Food Selection derives temporary exclusion options from labels on the current menu items; it never writes them back.
