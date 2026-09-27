from django.apps import AppConfig
from django.db.models.signals import post_migrate


def create_default_groups(sender, **kwargs):
    """Tự động tạo 2 group 'manager' và 'viewer' của Django khi migrate."""
    from django.contrib.auth.models import Group
    Group.objects.get_or_create(name="manager")
    Group.objects.get_or_create(name="viewer")


class InventoryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.inventory"

    def ready(self):
        post_migrate.connect(create_default_groups, sender=self)
