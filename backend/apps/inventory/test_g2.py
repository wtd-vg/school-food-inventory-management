import json
from django.test import TestCase, Client
from django.contrib.auth.models import User, Group
from apps.inventory.models import SchoolClass, Dish, FoodItem, Category

class G2Tests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(username="test_admin", password="password")
        manager_group, _ = Group.objects.get_or_create(name="manager")
        self.user.groups.add(manager_group)
        self.client.force_login(self.user)
        
        self.cat = Category.objects.create(code="CAT1", name="Cat 1")
        self.food = FoodItem.objects.create(code="F1", name="Gạo", category=self.cat, unit="kg")
        self.food_lit = FoodItem.objects.create(code="F2", name="Nước mắm", category=self.cat, unit="lit")

    def test_class_api(self):
        response = self.client.post("/api/classes/", json.dumps({"code": "1A", "name": "Lớp 1A"}), content_type="application/json")
        self.assertEqual(response.status_code, 201)
        
        response = self.client.get("/api/classes/")
        data = response.json()
        self.assertEqual(len(data["results"]), 1)
        self.assertEqual(data["results"][0]["code"], "1A")
        
    def test_dish_api(self):
        payload = {
            "code": "D1",
            "name": "Cơm",
            "components": [
                {"food_id": self.food.id, "quantity": "500", "unit": "g"}
            ]
        }
        response = self.client.post("/api/dishes/", json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 201)
        
        # Test error unit
        payload_err = {
            "code": "D2",
            "name": "Lỗi",
            "components": [
                {"food_id": self.food_lit.id, "quantity": "500", "unit": "kg"}
            ]
        }
        response_err = self.client.post("/api/dishes/", json.dumps(payload_err), content_type="application/json")
        self.assertEqual(response_err.status_code, 400)
        self.assertIn("Cannot convert kg to lit", response_err.json()["message"])

