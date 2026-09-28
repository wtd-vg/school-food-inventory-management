from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from .models import FoodItem, StockTake, StockTakeItem, InventoryLedger

@transaction.atomic
def create_stocktake(food_ids):
    foods = FoodItem.objects.filter(id__in=food_ids).select_for_update()
    if not foods:
        raise ValidationError("No valid food items provided.")
    
    st = StockTake.objects.create(status='draft')
    items = []
    for food in foods:
        items.append(StockTakeItem(
            stock_take=st,
            food=food,
            snapshot_qty=food.quantity,
            snapshot_cost=food.avg_cost,
            snapshot_version=food.stock_version,
            counted_qty=None,
            variance=0
        ))
    StockTakeItem.objects.bulk_create(items)
    return st

@transaction.atomic
def update_stocktake_item(item_id, counted_qty):
    if counted_qty is None or Decimal(counted_qty) < 0:
        raise ValidationError("counted_qty must be a non-negative number.")
    
    item = StockTakeItem.objects.select_related('stock_take').get(id=item_id)
    if item.stock_take.status != 'draft':
        raise ValidationError("Can only update draft stock takes.")
    
    item.counted_qty = Decimal(counted_qty)
    item.variance = item.counted_qty - item.snapshot_qty
    item.save(update_fields=['counted_qty', 'variance'])
    return item

@transaction.atomic
def post_stocktake(stocktake_id):
    # Lock the stocktake first to avoid concurrent posting
    try:
        st = StockTake.objects.select_for_update(nowait=True).get(id=stocktake_id)
    except Exception:
        raise ValidationError("StockTake is already being processed.")

    if st.status != 'draft':
        raise ValidationError("Only draft stock takes can be posted.")

    items = list(st.items.select_related('food').all())
    food_ids = [item.food_id for item in items]
    
    # Lock foods to prevent concurrent stock updates
    foods = {f.id: f for f in FoodItem.objects.filter(id__in=food_ids).select_for_update()}

    for item in items:
        if item.counted_qty is None:
            raise ValidationError(f"Food {item.food.name} has not been counted.")
        
        current_food = foods[item.food_id]
        if current_food.stock_version != item.snapshot_version:
            # 409 Conflict logic
            raise ValueError(f"Snapshot for {current_food.name} is outdated.")
            
        variance = item.counted_qty - item.snapshot_qty
        
        # Only create ledger if there is a variance
        if variance != 0:
            InventoryLedger.objects.create(
                food=current_food,
                transaction_type='ADJUST',
                quantity_change=variance,
                cost=current_food.avg_cost,
                reference=f"StockTake {st.id}"
            )
        
        # Update food
        current_food.quantity = item.counted_qty
        current_food.stock_version += 1
        current_food.save(update_fields=['quantity', 'stock_version'])
    
    st.status = 'posted'
    st.save(update_fields=['status'])
    return st
