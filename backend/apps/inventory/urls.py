"""URL của app inventory."""

from django.urls import path

from apps.inventory.views import hello

urlpatterns = [
    path("hello/", hello, name="hello"),
]
