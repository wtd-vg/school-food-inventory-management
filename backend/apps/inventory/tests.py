"""Test đầu tiên, dùng test runner có sẵn của Django."""

from django.test import Client, TestCase
from django.db import IntegrityError
from .models import Category, Supplier, FoodItem

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
    
    def test_api_post_same_code(self):
        Category.objects.create(code="RICE",name="Gạo tẻ")
        first_count_behind_call = Category.objects.count()
        payload ={
            "code": "RICE" ,
            "name": "Gạo nếp"

        }
        response = self.client.post(
            '/api/categories/',
            data=payload,
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        after_count = Category.objects.count()
        self.assertEqual(after_count,first_count_behind_call)
    
    def test_api_post_missing_data(self):
        first_count_behind_call = Category.objects.count()
        payload = {"code":"NEW_CODE"}
        response = self.client.post('/api/categories/', data=payload, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Category.objects.count(), first_count_behind_call)
    
    def test_api_post_successful_201(self):
        first_count_behind_call = Category.objects.count()
        payload = {"code": "CAFFEINE", "name": "Cà phê các loại"}
        
        response = self.client.post('/api/categories/', data=payload, content_type='application/json')
        
        # Phải trả về đúng mã 201 Created
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Category.objects.count(),first_count_behind_call + 1)
        
        # Dữ liệu trả về phải có id
        data = response.json()
        self.assertIn('id', data)
        self.assertEqual(data['code'], "CAFFEINE")


class FoodItemModelTest(TestCase):
    def setUp(self):
        # Tạo mồi sẵn 1 Category và 1 Supplier hợp lệ để lấy ID
        self.category = Category.objects.create(code="DRINK", name="Đồ uống")
        self.supplier = Supplier.objects.create(code="SUP01", name="NCC01")
    def test_api_post_fooditem_hack_quantity(self):
        payload = {
            "code": "COCA", "name": "Coca Cola", "price": 10000, "unit": "Lon",
            "category_id": self.category.id, "supplier_id": self.supplier.id,
            "quantity": 999  # <--- Bẫy ở đây
        }
        response = self.client.post('/api/foods/', data=payload, content_type='application/json')
        # Lần này expect 400 mới là đúng vì API đã chặn chuẩn!
        self.assertEqual(response.status_code, 400)

    # Kịch bản 2: Gửi data con ngoan trò giỏi -> Thành công (201) và default = 0
    def test_api_post_fooditem_sucessful(self):
        payload_sach = {
            "code": "PEPSI", "name": "Pepsi", "price": 10000, "unit": "Lon",
            "category_id": self.category.id, "supplier_id": self.supplier.id
            # TUYỆT ĐỐI KHÔNG gửi quantity
        }
        response = self.client.post('/api/foods/', data=payload_sach, content_type='application/json')
        
        self.assertEqual(response.status_code, 201)
        
        # Móc DB lên check xem có đúng tự động gán = 0 không
        new_food = FoodItem.objects.get(code="PEPSI")
        self.assertEqual(new_food.quantity, 0)
    
    def test_api_patch_category_dang_duoc_su_dung(self):
        from .models import FoodItem, Category
        
        # 1. Tạo mồi 1 Category
        cat = Category.objects.create(code="DRINK2", name="Đồ uống 2", is_active=True)
        
        # 2. Tạo mồi 1 FoodItem trỏ tới Category đó
        FoodItem.objects.create(
            code="COCA2", 
            name="Coca 2", 
            category=cat,
            unit="Lon"
        )
        
        # 3. Gửi request PATCH đòi khóa Category (Xóa mềm)
        payload = {"is_active": False}
        response = self.client.patch(f'/api/categories/{cat.id}/', data=payload, content_type='application/json')
        
        # 4. Kỳ vọng: API phải khôn ngoan chặn lại (trả về 400) vì Category này đang có món ăn sử dụng
        self.assertEqual(response.status_code, 400)
        
        # 5. Check DB: Category vẫn phải đang Active
        cat.refresh_from_db()
        self.assertTrue(cat.is_active)
    
    def test_api_patch_fooditem_hack_quantity(self):
        from .models import FoodItem, Category
        
        # Tạo mồi data sạch
        cat = Category.objects.create(code="SNACK", name="Đồ ăn vặt")
        food = FoodItem.objects.create(code="Tráng Miệng", name="Thạch ", category=cat, unit="cái")
        
        # Đóng giả hacker, dùng PATCH để lén bơm tồn kho lên 9999
        payload = {"quantity": 9999}
        response = self.client.patch(f'/api/foods/{food.id}/', data=payload, content_type='application/json')
        
        # BẮT BUỘC phải là 400. Nếu nó trả về 200 (OK) -> Thằng TV2 toang!
        self.assertEqual(response.status_code, 400)
        
        # Cẩn thận soi lại DB xem kho có bị bơm khống không
        food.refresh_from_db()
        self.assertEqual(food.quantity, 0)

    
    # BẪY 2: HIỂN THỊ XÁC SỐNG (GET CATEGORY)
    def test_api_get_category_chi_lay_active(self):
        from .models import Category
        
        # Tạo mồi: 1 thằng sống (True) và 1 thằng chết (False)
        Category.objects.create(code="ALIVE", name="Đang bán", is_active=True)
        Category.objects.create(code="DEAD", name="Ngừng kinh doanh", is_active=False)
        
        # Gọi API lấy danh sách
        response = self.client.get('/api/categories/')
        self.assertEqual(response.status_code, 200)
        
        # Chuyển cục JSON trả về thành string để tìm kiếm cho nhanh
        response_data = str(response.json())
        
        # Thằng ALIVE phải xuất hiện
        self.assertIn("ALIVE", response_data)
        # Thằng DEAD tuyệt đối KHÔNG được lòi mặt ra
        self.assertNotIn("DEAD", response_data)