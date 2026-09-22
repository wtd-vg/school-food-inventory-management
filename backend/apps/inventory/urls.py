"""URL của app inventory."""

from django.urls import path

from apps.inventory.views import hello , categories

urlpatterns = [
    path("hello/", hello, name="hello"),
    path("categories/" , categories , name ="categories")
]
