# Existing withdrawal contract

`DELETE /api/food-selections/:id/orders` uses selected-office context and signed identity. Optional `orderId` removes that owned entry; omitted ID removes all own entries. Collection cutoff and authorization remain. Existing `order_withdrawn` synchronizes the matching entry or all actor entries. No new interface.
