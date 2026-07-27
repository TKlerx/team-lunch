# Menu Item Safety Label Contracts

## Shared menu item response

All menu endpoints and food-selection state that expose a menu item include separate optional-safe lists:

```json
{
  "id": "item-id",
  "name": "Paneer Pakora",
  "tags": ["vegetarian"],
  "allergens": ["milk", "gluten"],
  "additives": ["colouring"]
}
```

`tags` remains a preference/recommendation label set. `allergens` and `additives` are safety-label sets and have no recommendation meaning.

## Create and update item requests

`POST /api/menus/:menuId/items` and `PUT /api/menus/:menuId/items/:id` accept optional fields:

```json
{
  "allergens": [" Milk ", "milk"],
  "additives": ["colouring"]
}
```

Accepted lists are trimmed, lowercased, and deduplicated. A non-array, non-string element, or value longer than 60 characters returns the existing `400 { "error": "..." }` validation response. On update, omitted fields leave stored safety labels unchanged; an empty array clears that set.

## JSON menu import item

Every imported item may include:

```json
{
  "name": "Paneer Pakora",
  "ingredients": "...",
  "price": 5.9,
  "tags": ["vegetarian"],
  "allergens": ["milk", "gluten"],
  "additives": ["colouring"]
}
```

`allergens` and `additives` are optional arrays of text. Missing fields become empty lists. Any invalid safety-label field rejects the entire import with the existing path-specific violation format, for example:

```json
{
  "error": "Import payload validation failed",
  "violations": [
    {
      "path": "menu[1].items[0].allergens[1]",
      "message": "allergens[1] must be a string"
    }
  ]
}
```

## Extraction-prompt contract

The import prompt instructs extraction to:

- emit `tags` only for preference/diet/course labels;
- emit `allergens` from the source’s allergen legend or explicitly stated allergen information;
- emit `additives` from the source’s additive legend or explicitly stated additive information;
- use lowercase labels and omit unknown fields rather than inventing data;
- treat vegetarian/vegan annotations as tags, never allergens.

## Food-selection UI contract

The active food-selection UI derives unique allergen and additive controls from current items. A selected value excludes an item when either its `allergens` or `additives` list contains that value. Selected values are in-memory only, apply across meal and beverage tabs, and clear when the view unmounts.
