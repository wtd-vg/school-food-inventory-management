"""Test đầu tiên, dùng test runner có sẵn của Django."""

from django.test import Client, TestCase
from django.db import IntegrityError
from .models import Category

class HelloApiTest(TestCase):
    def test_hello_api_connects_to_database(self) -> None:
        response = Client().get("/api/hello/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["database"], "PostgreSQL đã kết nối.")

class CategoryModelTest(TestCase): 

    def test_empty_list(self): #test danh sách rỗng 
        count = Category.objects.count()
        self.assertEqual(count, 0)

    def test_valid_data(self): #test dữ liệu hợp lệ
        Category.objects.create(code="RICE",name="Các loại gạo")
        Category.objects.create(code="MEAT",name="Các loại thịt")

        count = Category.objects.count()
        self.assertEqual(count,2)

    def test_block_same_data(self):   #test xem 2 danh mục trùng nhau thì Db phải quăng lỗi Intergrity Error
        Category.objects.create(code="Vegetables", name="Rau")
        with self.assertRaises(IntegrityError):
            Category.objects.create(code="Vegetables",name="Rau củ quả")
    
    def test_api(self):
        Category.objects.create(code="RICE", name="Gạo")
        Category.objects.create(code="MEAT", name="Thịt")
        response = self.client.get('/api/categories/')
        data = response.json()
        self.assertEqual(len(data['results']), 2) 
        self.assertEqual(data['results'][0]['code'], 'RICE')
    