import json
from decimal import Decimal
from django.test import TestCase, Client
from django.contrib.auth.models import User, Group
from apps.inventory.models import SchoolClass, Dish, FoodItem, Category, RecipeComponent

class ClassApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.viewer_user = User.objects.create_user(username="viewer", password="password")
        viewer_group, _ = Group.objects.get_or_create(name="viewer")
        self.viewer_user.groups.add(viewer_group)
        
        self.admin_user = User.objects.create_user(username="admin", password="password")
        manager_group, _ = Group.objects.get_or_create(name="manager")
        self.admin_user.groups.add(manager_group)
        
    def test_class_viewer_permission_denied(self):
        self.client.force_login(self.viewer_user)
        # POST
        response = self.client.post("/api/classes/", json.dumps({"code": "1A", "name": "Lớp 1A"}), content_type="application/json")
        self.assertEqual(response.status_code, 403)
        # GET is allowed for viewers
        response_get = self.client.get("/api/classes/")
        self.assertEqual(response_get.status_code, 200)

    def test_class_validation_empty_fields(self):
        self.client.force_login(self.admin_user)
        # Missing code
        response = self.client.post("/api/classes/", json.dumps({"name": "Lớp 1A"}), content_type="application/json")
        self.assertEqual(response.status_code, 400)
        # Missing name
        response = self.client.post("/api/classes/", json.dumps({"code": "1A"}), content_type="application/json")
        self.assertEqual(response.status_code, 400)
        # Empty string
        response = self.client.post("/api/classes/", json.dumps({"code": "  ", "name": ""}), content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_class_duplicate_code(self):
        self.client.force_login(self.admin_user)
        SchoolClass.objects.create(code="1A", name="Lớp 1A")
        
        response = self.client.post("/api/classes/", json.dumps({"code": "1A", "name": "Lớp 1A Mới"}), content_type="application/json")
        self.assertEqual(response.status_code, 409)


class RecipeApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin_user = User.objects.create_user(username="admin", password="password")
        manager_group, _ = Group.objects.get_or_create(name="manager")
        self.admin_user.groups.add(manager_group)
        self.client.force_login(self.admin_user)
        
        self.cat = Category.objects.create(code="CAT1", name="Cat 1")
        self.muoi = FoodItem.objects.create(code="MUOI", name="Muối", category=self.cat, unit="kg")
        self.nuoc_mam = FoodItem.objects.create(code="NMAM", name="Nước mắm", category=self.cat, unit="lit")

    def test_recipe_correct_conversion(self):
        # Muối 500g -> 0.5kg
        payload = {
            "code": "D1",
            "name": "Canh Chua",
            "components": [
                {"food_id": self.muoi.id, "quantity": "500", "unit": "g"}
            ]
        }
        response = self.client.post("/api/dishes/", json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 201)
        
        comp = RecipeComponent.objects.get(dish__code="D1", food=self.muoi)
        self.assertEqual(comp.quantity, Decimal('0.500'))
        
        # Nước mắm 300ml -> 0.3lit
        payload2 = {
            "code": "D2",
            "name": "Thịt kho",
            "components": [
                {"food_id": self.nuoc_mam.id, "quantity": "300", "unit": "ml"}
            ]
        }
        response2 = self.client.post("/api/dishes/", json.dumps(payload2), content_type="application/json")
        self.assertEqual(response2.status_code, 201)
        
        comp2 = RecipeComponent.objects.get(dish__code="D2", food=self.nuoc_mam)
        self.assertEqual(comp2.quantity, Decimal('0.300'))

    def test_recipe_wrong_dimension(self):
        payload = {
            "code": "ERR1",
            "name": "Lỗi 1",
            "components": [
                {"food_id": self.nuoc_mam.id, "quantity": "500", "unit": "g"}
            ]
        }
        response = self.client.post("/api/dishes/", json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Cannot convert g to lit", response.json()["message"])

    def test_recipe_malicious_values(self):
        bad_values = ["-50", "0", "NaN", "Infinity", "abc"]
        for val in bad_values:
            payload = {
                "code": "BAD",
                "name": "Bad",
                "components": [
                    {"food_id": self.muoi.id, "quantity": val, "unit": "kg"}
                ]
            }
            response = self.client.post("/api/dishes/", json.dumps(payload), content_type="application/json")
            self.assertEqual(response.status_code, 400, f"Failed on value: {val}")
            self.assertTrue(
                "Must be positive and finite" in response.json()["message"] or 
                "Invalid number format" in response.json()["message"]
            )

    def test_recipe_atomic_transaction_rollback(self):
        payload = {
            "code": "ATOMIC",
            "name": "Món lỗi",
            "components": [
                {"food_id": self.muoi.id, "quantity": "500", "unit": "g"},
                {"food_id": self.muoi.id, "quantity": "100", "unit": "g"} # Lặp thức ăn
            ]
        }
        response = self.client.post("/api/dishes/", json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Duplicate food in components", response.json()["message"])
        
        # Món ăn không được tạo
        self.assertFalse(Dish.objects.filter(code="ATOMIC").exists())
        
        payload2 = {
            "code": "ATOMIC2",
            "name": "Món lỗi 2",
            "components": [
                {"food_id": self.muoi.id, "quantity": "500", "unit": "g"},
                {"food_id": self.nuoc_mam.id, "quantity": "50", "unit": "g"} # Sai thứ nguyên
            ]
        }
        response2 = self.client.post("/api/dishes/", json.dumps(payload2), content_type="application/json")
        self.assertEqual(response2.status_code, 400)
        
        # Món ăn không được tạo
        self.assertFalse(Dish.objects.filter(code="ATOMIC2").exists())

    def test_recipe_empty_components(self):
        payload = {
            "code": "EMPTY",
            "name": "Rỗng",
            "components": []
        }
        response = self.client.post("/api/dishes/", json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Empty recipe", response.json()["message"])
