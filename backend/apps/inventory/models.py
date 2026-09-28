from django.db import models


class Category(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
class FoodItem(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)

    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="food_items"
    )

    unit = models.CharField(max_length=32)
    is_active = models.BooleanField(default=True)

    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=0
    )

    avg_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0
    )
    stock_version = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.code} - {self.name}"
class Supplier(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    phone = models.CharField(max_length=32, blank=True, default="")
    def __str__(self):
        return f"{self.code} - {self.name}"


class InventoryLedger(models.Model):
    food = models.ForeignKey(FoodItem, on_delete=models.PROTECT, related_name="ledger_entries")
    transaction_type = models.CharField(max_length=32)
    quantity_change = models.DecimalField(max_digits=14, decimal_places=3)
    cost = models.DecimalField(max_digits=14, decimal_places=2)
    reference = models.CharField(max_length=120, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

class StockTake(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('posted', 'Posted'),
    ]
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='draft')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class StockTakeItem(models.Model):
    stock_take = models.ForeignKey(StockTake, on_delete=models.CASCADE, related_name="items")
    food = models.ForeignKey(FoodItem, on_delete=models.PROTECT, related_name="stock_take_items")
    snapshot_qty = models.DecimalField(max_digits=14, decimal_places=3)
    snapshot_cost = models.DecimalField(max_digits=14, decimal_places=2)
    snapshot_version = models.IntegerField()
    counted_qty = models.DecimalField(max_digits=14, decimal_places=3, null=True, blank=True)
    variance = models.DecimalField(max_digits=14, decimal_places=3, default=0)
