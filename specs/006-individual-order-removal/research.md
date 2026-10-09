# Research

- Decision: reuse `api.withdrawOrder(selectionId, nickname, orderId?)`.
- Rationale: route resolves signed identity, service deletes owned entries and broadcasts orderId, reducer removes that entry. Existing server tests cover the flow.
- Alternative rejected: new endpoint or mutation hook adds no capability.
- Decision: add removal to the bottom summary; retain the order-board action. User confirmed this location.
- Decision: share pending state and toast path for item/bulk removal; server/SSE owns contents so failures retain entries and allow retry.
