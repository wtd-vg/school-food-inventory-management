"""Test đầu tiên, dùng test runner có sẵn của Django."""
import json
from django.test import Client, TestCase
from django.db import IntegrityError
from .models import Category
from .models import Supplier, Receipt, ReceiptLine, Issue, IssueLine
from decimal import Decimal
from django.contrib.auth.models import User
from .services import post_receipt, post_issue
from django.core.exceptions import ValidationError
from .models import (
    Category,
    FoodItem,                                              # Sửa lỗi "FoodItem" is not defined
    Supplier,
    Receipt,
    ReceiptLine,
    Issue,
    IssueLine,
    InventoryLedger,
    StockTake,
    StockTakeItem
)

# Import các hàm service
from .services import post_receipt, post_issue
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
        user = User.objects.create_user(username="cat_tester", password="pwd")
        self.client.force_login(user)
        response = self.client.get('/api/categories/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data['results']), 2) 
        self.assertEqual(data['results'][0]['code'], 'RICE')
class InventoryPostingSF20SF26Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(username="admin_user", password="pwd")
        self.cat = Category.objects.create(code="CAT_TEST", name="Test Category")
        self.supplier = Supplier.objects.create(code="SUP01", name="Nhà cung cấp A")

        # Gà: Tồn 10kg, giá vốn 50.00
        self.food_ga = FoodItem.objects.create(
            code="GA", name="Thịt gà", category=self.cat, unit="kg",
            quantity=Decimal("10.000"), avg_cost=Decimal("50.00"), stock_version=1
        )
        # Bò: Tồn 5kg, giá vốn 200.00
        self.food_bo = FoodItem.objects.create(
            code="BO", name="Thịt bò", category=self.cat, unit="kg",
            quantity=Decimal("5.000"), avg_cost=Decimal("200.00"), stock_version=1
        )

    # --- TEST SF20: NHẬP KHO & GIÁ BÌNH QUÂN ---
    def test_sf20_post_receipt_updates_stock_and_avg_cost(self):
        # 10kg * 50k + 10kg * 70k = 1200k / 20kg = 60k
        receipt = Receipt.objects.create(
            supplier=self.supplier, date="2026-04-01", created_by=self.user, status=Receipt.Status.DRAFT
        )
        ReceiptLine.objects.create(
            receipt=receipt, food=self.food_ga, quantity=Decimal("10.000"), unit_price=Decimal("70.00")
        )

        post_receipt(receipt.id)

        self.food_ga.refresh_from_db()
        receipt.refresh_from_db()

        self.assertEqual(receipt.status, Receipt.Status.POSTED)
        self.assertIsNotNone(receipt.posted_at)
        self.assertEqual(self.food_ga.quantity, Decimal("20.000"))
        self.assertEqual(self.food_ga.avg_cost, Decimal("60.00"))
        self.assertEqual(self.food_ga.stock_version, 2)

    # --- TEST SF26: XUẤT KHO & CHỐNG ÂM ---
    def test_sf26_post_issue_success_keeps_avg_cost(self):
        # Xuất 4kg gà -> Còn 6kg, giá vốn 50k không đổi
        issue = Issue.objects.create(
            code="XK01", date="2026-04-01", created_by=self.user, status=Issue.Status.DRAFT
        )
        IssueLine.objects.create(issue=issue, food=self.food_ga, quantity=Decimal("4.000"))

        post_issue(issue.id)

        self.food_ga.refresh_from_db()
        self.assertEqual(self.food_ga.quantity, Decimal("6.000"))
        self.assertEqual(self.food_ga.avg_cost, Decimal("50.00"))
        self.assertEqual(self.food_ga.stock_version, 2)

    def test_sf26_post_issue_blocks_insufficient_stock(self):
        # Bò tồn 5kg, đòi xuất 10kg -> Báo lỗi, không trừ tồn kho
        issue = Issue.objects.create(
            code="XK02", date="2026-04-01", created_by=self.user, status=Issue.Status.DRAFT
        )
        IssueLine.objects.create(issue=issue, food=self.food_bo, quantity=Decimal("10.000"))

        with self.assertRaises(ValidationError):
            post_issue(issue.id)

        self.food_bo.refresh_from_db()
        self.assertEqual(self.food_bo.quantity, Decimal("5.000"))
    






class ReceiptAPISF22Tests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_superuser(username="admin_api", password="pwd")
        self.viewer = User.objects.create_user(username="viewer_api", password="pwd")
        self.cat = Category.objects.create(code="CAT_API", name="Test Cat API")
        self.supplier = Supplier.objects.create(code="SUP_API", name="NCC API")
        self.food = FoodItem.objects.create(
            code="FOOD_API", name="Gạo API", category=self.cat, unit="kg",
            quantity=Decimal("0.000"), avg_cost=Decimal("0.00"), stock_version=1
        )
        self.food_thit = FoodItem.objects.create(
            code="THIT_API", name="Thịt Lợn API", category=self.cat, unit="kg",
            quantity=Decimal("10.000"), avg_cost=Decimal("80.00"), stock_version=1
        )
        self.client.login(username="admin_api", password="pwd")

    def test_sf22_create_receipt_draft_success(self):
        """Test API tạo phiếu nhập nháp thành công và trả về ID để UI dùng tiếp."""
        payload = {
            "supplier": self.supplier.id,
            "date": "2026-04-02",
            "note": "Nhập gạo đợt 1",
            "lines": [
                {"food": self.food.id, "quantity": "50.000", "unit_price": "100.00"}
            ]
        }
        response = self.client.post(
            '/api/receipts/', 
            data=json.dumps(payload), 
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn('id', data)
        self.assertEqual(data['status'], 'DRAFT')
        self.assertEqual(len(data['lines']), 1)
        self.assertEqual(data['lines'][0]['food_id'], self.food.id)
        
        # Đảm bảo draft chưa làm thay đổi tồn kho
        self.food.refresh_from_db()
        self.assertEqual(self.food.quantity, Decimal("0.000"))
        self.assertEqual(self.food.avg_cost, Decimal("0.00"))
        self.assertEqual(self.food.stock_version, 1)

    def test_sf22_get_receipt_list_and_detail(self):
        """Test API danh sách và chi tiết phiếu nhập."""
        payload = {
            "supplier_id": self.supplier.id,
            "date": "2026-04-02",
            "lines": [{"food_id": self.food.id, "quantity": "10.000", "unit_price": "50.00"}]
        }
        post_res = self.client.post('/api/receipts/', data=json.dumps(payload), content_type='application/json')
        receipt_id = post_res.json()['id']

        # GET danh sách
        list_res = self.client.get('/api/receipts/')
        self.assertEqual(list_res.status_code, 200)
        list_data = list_res.json()
        self.assertIn('results', list_data)
        self.assertGreaterEqual(len(list_data['results']), 1)

        # GET chi tiết
        detail_res = self.client.get(f'/api/receipts/{receipt_id}/')
        self.assertEqual(detail_res.status_code, 200)
        self.assertEqual(detail_res.json()['id'], receipt_id)
        self.assertEqual(detail_res.json()['status'], 'DRAFT')

        # GET ID không tồn tại
        not_found_res = self.client.get('/api/receipts/99999/')
        self.assertEqual(not_found_res.status_code, 404)

    def test_sf22_post_receipt_success(self):
        """Test chốt phiếu nhập: cập nhật tồn kho và giá bình quân."""
        payload = {
            "supplier_id": self.supplier.id,
            "date": "2026-04-02",
            "lines": [{"food_id": self.food.id, "quantity": "20.000", "unit_price": "120.00"}]
        }
        post_res = self.client.post('/api/receipts/', data=json.dumps(payload), content_type='application/json')
        receipt_id = post_res.json()['id']

        # Chốt phiếu nhập
        chot_res = self.client.post(f'/api/receipts/{receipt_id}/post/')
        self.assertEqual(chot_res.status_code, 200)
        self.assertEqual(chot_res.json()['status'], 'POSTED')
        self.assertIsNotNone(chot_res.json().get('posted_at'))

        # Đối chiếu tồn kho
        self.food.refresh_from_db()
        self.assertEqual(self.food.quantity, Decimal("20.000"))
        self.assertEqual(self.food.avg_cost, Decimal("120.00"))
        self.assertEqual(self.food.stock_version, 2)

    def test_sf22_post_receipt_twice_returns_409(self):
        """Test API chặn chốt phiếu 2 lần, trả về lỗi 409."""
        payload = {
            "supplier_id": self.supplier.id,
            "date": "2026-04-02",
            "lines": [{"food_id": self.food.id, "quantity": "10.000", "unit_price": "50.00"}]
        }
        create_res = self.client.post('/api/receipts/', data=json.dumps(payload), content_type='application/json')
        receipt_id = create_res.json()['id']

        # Chốt lần 1 thành công
        res1 = self.client.post(f'/api/receipts/{receipt_id}/post/')
        self.assertEqual(res1.status_code, 200)

        # Chốt lần 2 phải trả về 409
        res2 = self.client.post(f'/api/receipts/{receipt_id}/post/')
        self.assertEqual(res2.status_code, 409)

    def test_sf22_invalid_field_returns_400(self):
        """Test API bắt lỗi validate JSON (thiếu trường, sai kiểu, số âm/0) trả về 400."""
        # Thiếu/sai supplier_id
        res = self.client.post('/api/receipts/', data=json.dumps({"supplier": "invalid"}), content_type='application/json')
        self.assertEqual(res.status_code, 400)

        # lines rỗng
        res_empty = self.client.post('/api/receipts/', data=json.dumps({
            "supplier_id": self.supplier.id, "date": "2026-04-02", "lines": []
        }), content_type='application/json')
        self.assertEqual(res_empty.status_code, 400)

        # quantity <= 0
        res_qty = self.client.post('/api/receipts/', data=json.dumps({
            "supplier_id": self.supplier.id, "date": "2026-04-02",
            "lines": [{"food_id": self.food.id, "quantity": "0", "unit_price": "100.00"}]
        }), content_type='application/json')
        self.assertEqual(res_qty.status_code, 400)

        # unit_price <= 0
        res_price = self.client.post('/api/receipts/', data=json.dumps({
            "supplier_id": self.supplier.id, "date": "2026-04-02",
            "lines": [{"food_id": self.food.id, "quantity": "10", "unit_price": "-10.00"}]
        }), content_type='application/json')
        self.assertEqual(res_price.status_code, 400)

        # Trùng food trong cùng 1 phiếu
        res_dup = self.client.post('/api/receipts/', data=json.dumps({
            "supplier_id": self.supplier.id, "date": "2026-04-02",
            "lines": [
                {"food_id": self.food.id, "quantity": "10", "unit_price": "100.00"},
                {"food_id": self.food.id, "quantity": "20", "unit_price": "110.00"},
            ]
        }), content_type='application/json')
        self.assertEqual(res_dup.status_code, 400)

    def test_sf22_permissions(self):
        """Test phân quyền: Chưa login trả 401, viewer không thể tạo/chốt phiếu (403), viewer được xem (200)."""
        # Anonymous
        self.client.logout()
        res_anon_get = self.client.get('/api/receipts/')
        self.assertEqual(res_anon_get.status_code, 401)
        res_anon_post = self.client.post('/api/receipts/', data="{}", content_type='application/json')
        self.assertEqual(res_anon_post.status_code, 401)

        # Viewer login
        self.client.login(username="viewer_api", password="pwd")
        res_viewer_get = self.client.get('/api/receipts/')
        self.assertEqual(res_viewer_get.status_code, 200)

        res_viewer_post = self.client.post('/api/receipts/', data=json.dumps({
            "supplier_id": self.supplier.id, "date": "2026-04-02",
            "lines": [{"food_id": self.food.id, "quantity": "10", "unit_price": "100.00"}]
        }), content_type='application/json')
        self.assertEqual(res_viewer_post.status_code, 403)

    def test_sf22_no_edit_or_delete_receipt(self):
        """Test API chặn sửa/xóa phiếu nhập: PATCH/DELETE trả về 405."""
        payload = {
            "supplier_id": self.supplier.id,
            "date": "2026-04-02",
            "lines": [{"food_id": self.food.id, "quantity": "10", "unit_price": "100.00"}]
        }
        res = self.client.post('/api/receipts/', data=json.dumps(payload), content_type='application/json')
        receipt_id = res.json()['id']

        patch_res = self.client.patch(f'/api/receipts/{receipt_id}/', data="{}", content_type='application/json')
        self.assertEqual(patch_res.status_code, 405)

        del_res = self.client.delete(f'/api/receipts/{receipt_id}/')
        self.assertEqual(del_res.status_code, 405)

    def test_sf22_response_no_traceback(self):
        """Kiểm tra response khi có lỗi không lộ HTML traceback mà trả JSON chuẩn."""
        bad_res = self.client.post('/api/receipts/', data="invalid json string", content_type='application/json')
        self.assertEqual(bad_res.status_code, 400)
        self.assertIn('application/json', bad_res['Content-Type'])
        self.assertIn('error', bad_res.json())


class IssueAPISF28Tests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_superuser(username="admin_issue", password="pwd")
        self.viewer = User.objects.create_user(username="viewer_issue", password="pwd")
        self.cat = Category.objects.create(code="CAT_ISSUE", name="Test Cat Issue")
        self.food = FoodItem.objects.create(
            code="FOOD_ISSUE", name="Thịt Bò", category=self.cat, unit="kg",
            quantity=Decimal("10.000"), avg_cost=Decimal("150.00"), stock_version=1
        )
        self.food2 = FoodItem.objects.create(
            code="FOOD_ISSUE_2", name="Rau Cải", category=self.cat, unit="kg",
            quantity=Decimal("20.000"), avg_cost=Decimal("15.00"), stock_version=1
        )
        self.client.login(username="admin_issue", password="pwd")

    def test_sf28_create_issue_draft_success(self):
        """Test tạo phiếu xuất nháp: Client không gửi unit_cost, draft không đổi tồn kho."""
        payload = {
            "date": "2026-04-03",
            "note": "Xuất cho bếp ăn sáng",
            "lines": [
                {"food": self.food.id, "quantity": "3.500"}
            ]
        }
        response = self.client.post(
            '/api/issues/', 
            data=json.dumps(payload), 
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn('id', data)
        self.assertEqual(data['status'], 'DRAFT')
        self.assertIn('code', data)
        self.assertEqual(len(data['lines']), 1)

        # Đảm bảo draft chưa trừ tồn kho
        self.food.refresh_from_db()
        self.assertEqual(self.food.quantity, Decimal("10.000"))
        self.assertEqual(self.food.avg_cost, Decimal("150.00"))
        self.assertEqual(self.food.stock_version, 1)

    def test_sf28_get_issue_list_and_detail(self):
        """Test API danh sách và chi tiết phiếu xuất."""
        payload = {
            "date": "2026-04-03",
            "lines": [{"food_id": self.food.id, "quantity": "2.000"}]
        }
        create_res = self.client.post('/api/issues/', data=json.dumps(payload), content_type='application/json')
        issue_id = create_res.json()['id']

        # GET danh sách
        list_res = self.client.get('/api/issues/')
        self.assertEqual(list_res.status_code, 200)
        self.assertIn('results', list_res.json())

        # GET chi tiết
        detail_res = self.client.get(f'/api/issues/{issue_id}/')
        self.assertEqual(detail_res.status_code, 200)
        self.assertEqual(detail_res.json()['id'], issue_id)
        self.assertEqual(detail_res.json()['status'], 'DRAFT')

        # GET 404
        not_found_res = self.client.get('/api/issues/99999/')
        self.assertEqual(not_found_res.status_code, 404)

    def test_sf28_post_issue_success(self):
        """Test chốt xuất kho thành công: Trừ tồn kho, snapshot unit_cost, giữ nguyên avg_cost."""
        payload = {
            "date": "2026-04-03",
            "lines": [{"food_id": self.food.id, "quantity": "4.000"}]
        }
        create_res = self.client.post('/api/issues/', data=json.dumps(payload), content_type='application/json')
        issue_id = create_res.json()['id']

        # Chốt xuất
        post_res = self.client.post(f'/api/issues/{issue_id}/post/')
        self.assertEqual(post_res.status_code, 200)
        data = post_res.json()
        self.assertEqual(data['status'], 'POSTED')
        self.assertIsNotNone(data['posted_at'])

        # Tồn kho giảm từ 10 xuống 6, avg_cost giữ nguyên 150
        self.food.refresh_from_db()
        self.assertEqual(self.food.quantity, Decimal("6.000"))
        self.assertEqual(self.food.avg_cost, Decimal("150.00"))
        self.assertEqual(self.food.stock_version, 2)

        # Kiểm tra chi tiết phiếu sau chốt: total = 4 * 150 = 600.00
        detail = self.client.get(f'/api/issues/{issue_id}/').json()
        self.assertEqual(detail['lines'][0]['unit_cost'], '150.00')
        self.assertEqual(detail['total_value'], '600.00')

    def test_sf28_post_issue_twice_returns_409(self):
        """Test chặn chốt phiếu xuất 2 lần: Lần hai trả 409 Conflict."""
        payload = {
            "date": "2026-04-03",
            "lines": [{"food_id": self.food.id, "quantity": "1.000"}]
        }
        create_res = self.client.post('/api/issues/', data=json.dumps(payload), content_type='application/json')
        issue_id = create_res.json()['id']

        res1 = self.client.post(f'/api/issues/{issue_id}/post/')
        self.assertEqual(res1.status_code, 200)

        res2 = self.client.post(f'/api/issues/{issue_id}/post/')
        self.assertEqual(res2.status_code, 409)

    def test_sf28_post_issue_insufficient_stock_returns_409(self):
        """Test API chặn xuất quá tồn kho, trả 409 kèm tên food và lượng còn lại."""
        issue = Issue.objects.create(
            code="XK_TEST_ERR", date="2026-04-03", created_by=self.manager, status=Issue.Status.DRAFT
        )
        IssueLine.objects.create(issue=issue, food=self.food, quantity=Decimal("20.000"))

        response = self.client.post(f'/api/issues/{issue.id}/post/')
        self.assertEqual(response.status_code, 409)
        data = response.json()

        # Response thiếu tồn kèm tên food và lượng còn
        self.assertIn('Thịt Bò', str(data))
        self.assertIn('10.000', str(data))
        
        # Đảm bảo không thay đổi tồn kho khi chốt lỗi
        self.food.refresh_from_db()
        self.assertEqual(self.food.quantity, Decimal("10.000"))

    def test_sf28_invalid_quantity_returns_400(self):
        """Test API chặn xuất kho với số lượng âm, bằng 0, hoặc không hợp lệ."""
        for bad_qty in ("-5", "0", "-0.001", "abc"):
            with self.subTest(qty=bad_qty):
                payload = {
                    "date": "2026-04-03",
                    "lines": [{"food": self.food.id, "quantity": bad_qty}]
                }
                response = self.client.post('/api/issues/', data=json.dumps(payload), content_type='application/json')
                self.assertEqual(response.status_code, 400)

    def test_sf28_invalid_food_returns_400(self):
        """Test API chặn food không tồn tại, trùng food, hoặc lines rỗng."""
        # Food không tồn tại
        res_food = self.client.post('/api/issues/', data=json.dumps({
            "date": "2026-04-03", "lines": [{"food_id": 99999, "quantity": "1.000"}]
        }), content_type='application/json')
        self.assertEqual(res_food.status_code, 400)

        # Trùng food
        res_dup = self.client.post('/api/issues/', data=json.dumps({
            "date": "2026-04-03",
            "lines": [
                {"food_id": self.food.id, "quantity": "1.000"},
                {"food_id": self.food.id, "quantity": "2.000"},
            ]
        }), content_type='application/json')
        self.assertEqual(res_dup.status_code, 400)

        # lines rỗng
        res_empty = self.client.post('/api/issues/', data=json.dumps({
            "date": "2026-04-03", "lines": []
        }), content_type='application/json')
        self.assertEqual(res_empty.status_code, 400)

    def test_sf28_permissions(self):
        """Test phân quyền SF13: Chưa login trả 401, viewer không thể tạo/chốt (403), viewer được xem (200)."""
        self.client.logout()
        # Anonymous
        self.assertEqual(self.client.get('/api/issues/').status_code, 401)
        self.assertEqual(self.client.post('/api/issues/', data="{}", content_type='application/json').status_code, 401)

        # Viewer
        self.client.login(username="viewer_issue", password="pwd")
        self.assertEqual(self.client.get('/api/issues/').status_code, 200)

        res_viewer_post = self.client.post('/api/issues/', data=json.dumps({
            "date": "2026-04-03", "lines": [{"food_id": self.food.id, "quantity": "1.000"}]
        }), content_type='application/json')
        self.assertEqual(res_viewer_post.status_code, 403)

    def test_sf28_read_only_methods(self):
        """Test API chặn sửa/xóa phiếu xuất: PATCH/DELETE trả về 405."""
        payload = {
            "date": "2026-04-03",
            "lines": [{"food_id": self.food.id, "quantity": "1.000"}]
        }
        res = self.client.post('/api/issues/', data=json.dumps(payload), content_type='application/json')
        issue_id = res.json()['id']

        self.assertEqual(self.client.patch(f'/api/issues/{issue_id}/', data="{}", content_type='application/json').status_code, 405)
        self.assertEqual(self.client.delete(f'/api/issues/{issue_id}/').status_code, 405)

    def test_sf28_response_no_traceback(self):
        """Kiểm tra response khi có lỗi không lộ HTML traceback mà trả JSON chuẩn."""
        bad_res = self.client.post('/api/issues/', data="bad json", content_type='application/json')
        self.assertEqual(bad_res.status_code, 400)
        self.assertIn('application/json', bad_res['Content-Type'])
        self.assertIn('error', bad_res.json())