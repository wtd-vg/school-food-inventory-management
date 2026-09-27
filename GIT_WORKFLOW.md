# Quy chuẩn Git & Quy trình làm việc nhóm (Team Git Workflow)

> **Dành cho:** TV1 (Leader) và các thành viên (TV2 – TV6) dự án **School Food Inventory Management**.  
> **Mục tiêu:** Giúp cả team làm việc trơn tru, không giẫm chân lên nhau, tránh mất thời gian xử lý xung đột và ngăn ngừa triệt để các sự cố vỡ repo (như commit thư mục `venv/`, đè database, merge sai nhánh).

---

## 1. Bốn quy tắc "bất di bất dịch" (Golden Rules)

1. **Tuyệt đối KHÔNG dùng `git add .` bừa bãi:**
   * Luôn chạy `git status` trước để xem mình đang thay đổi những file nào.
   * Chỉ `git add <tên_file_cụ_thể>` thuộc phạm vi task của mình.
2. **Cấm tuyệt đối commit các file sau lên GitHub:**
   * Thư mục môi trường ảo: `venv/`, `.venv/`, `env/` (hàng ngàn file thư viện, làm nặng repo).
   * File database nội bộ: `db.sqlite3`, `*.sqlite3` (gây đè và xung đột dữ liệu giữa các máy).
   * File bí mật: `.env` (chứa secret key, mật khẩu kết nối DB).
   * File rác tạo nhầm: các file không đuôi như `git`, `son`, log tạm.
3. **Nhánh nền chung tích hợp là `dev1`:**
   * Mọi nhánh tính năng **phải tách ra từ `dev1`** và **mở Pull Request (PR) về `dev1`**.
   * **KHÔNG** merge chéo giữa các nhánh cá nhân (ví dụ: `QuangKiet` merge thẳng vào `son` là sai quy trình).
4. **Không làm việc trực tiếp trên nhánh `dev1` hoặc `main`:**
   * Mọi việc từ sửa một dòng chữ đến viết cả tính năng đều phải làm trên nhánh task riêng (`feat/SF...`).

---

## 2. Quy ước đặt tên nhánh & Commit message

### 2.1. Đặt tên nhánh (Branch naming)
Format: `<loại>/<Mã_SF>-<tên-ngắn-gọn>`

| Loại | Khi nào dùng | Ví dụ |
| :--- | :--- | :--- |
| `feat/` | Thêm tính năng mới | `feat/SF08-category-model`, `feat/SF13-auth-session`, `feat/SF15-food-page` |
| `fix/` | Sửa lỗi tính năng / UI | `fix/SF11-category-ui`, `fix/SF14-supplier-phone-field` |
| `test/` | Viết bộ kiểm thử | `test/SF10-category-tests`, `test/SF16-auth-validation-tests` |
| `docs/` | Viết hoặc cập nhật tài liệu | `docs/SF07-update-architecture`, `docs/git-workflow` |

### 2.2. Quy chuẩn commit message
Format: `<loại>: [Mã_SF] Mô tả ngắn gọn việc vừa làm`

* **Đúng:**
  * `feat: [SF08] create Category model and migration`
  * `fix: [SF14] switch category delete to PATCH is_active`
  * `test: [SF10] add tests for empty list and duplicate code`
* **Sai (Không được viết thế này):**
  * `son1`, `son2`, `update`, `fix bug`, `xong roi` (không ai hiểu commit này chứa gì).

---

## 3. Quy trình 6 bước làm một Task chuẩn chỉ

Mỗi khi bạn bắt đầu một task mới (ví dụ: làm **SF14**):

### Bước 1: Đồng bộ nhánh `dev1` mới nhất về máy
Trước khi tạo nhánh mới, luôn đảm bảo bạn xuất phát từ code mới nhất của cả nhóm:
```powershell
git switch dev1
git pull origin dev1
```

### Bước 2: Tạo nhánh riêng cho task
```powershell
git switch -c feat/SF14-food-supplier-crud
```

### Bước 3: Code và kiểm tra liên tục
* Chỉ sửa/tạo các file được phân công trong tài liệu [SchoolFood_HuongDan_Task.md](outputs/team-6/SchoolFood_HuongDan_Task.md).
* Sau khi code xong một phần, kiểm tra:
  ```powershell
  git status
  ```
  *(Đảm bảo không có file rác, không có `venv/` hay `db.sqlite3` xuất hiện trong danh sách).*

### Bước 4: Add file và commit
```powershell
git add backend/apps/inventory/models.py
git add backend/apps/inventory/views.py
git commit -m "feat: [SF14] add FoodItem and Supplier CRUD APIs"
```

### Bước 5: Đẩy nhánh lên GitHub
```powershell
git push -u origin feat/SF14-food-supplier-crud
```

### Bước 6: Mở Pull Request (PR) về `dev1`
1. Vào GitHub repo: `https://github.com/wtd-vg/school-food-inventory-management`
2. Bấm **Compare & pull request**.
3. **Quan trọng:** Chọn **base: `dev1`** ⬅️ **compare: `feat/SF14-food-supplier-crud`**.
4. Điền nội dung PR theo mẫu:
   ```markdown
   ## Mã Task: SF14
   - Người làm: TV2
   - Reviewer: TV4

   ### Các việc đã làm:
   - Thêm model FoodItem, Supplier theo schema
   - Viết API GET/POST/PATCH, chặn hard delete
   
   ### Cách kiểm tra:
   - Chạy migrate: docker compose exec backend python manage.py migrate
   - Gọi GET /api/foods/
   
   ### Bằng chứng:
   - Ảnh chụp màn hình kết quả / log test
   ```
5. Báo reviewer (theo phân công trong checklist) vào xem code và duyệt.
6. Leader (TV1) bấm **Merge pull request** vào `dev1`.

---

## 4. Kíp cấp cứu: Xử lý các sự cố Git hay gặp

### Trường hợp 1: Lỡ thêm nhầm file rác / `venv` / database vào Git
Nếu bạn lỡ gõ `git add .` và thấy `venv/` hoặc file database bị đưa vào Git tracking:
```powershell
# Gỡ thư mục ảo venv khỏi Git tracking (file trên máy bạn vẫn còn nguyên, không bị mất)
git rm -r --cached venv

# Gỡ file database SQLite khỏi Git tracking
git rm --cached backend/db.sqlite3

# Thêm vào .gitignore và commit ngay
git commit -m "fix: untrack venv and sqlite3 database"
```

### Trường hợp 2: Bị báo xung đột (Conflict) khi mở PR
Khi nhánh `dev1` đã có người khác merge code mới trước bạn, nhánh của bạn bị cũ:
```powershell
# Đang đứng ở nhánh của bạn (ví dụ feat/SF14...)
git fetch origin
git merge origin/dev1
```
* Mở VS Code, xem các file bị conflict (màu đỏ).
* Chọn **Accept Current Change** hoặc **Accept Incoming Change** (thảo luận với đồng đội nếu không chắc code của ai đúng).
* Sau khi sửa hết xung đột:
```powershell
git add .
git commit -m "fix: resolve conflict with dev1"
git push origin feat/SF14-food-supplier-crud
```

### Trường hợp 3: Máy hiện file rác không đuôi lạ (`git`, `son`)
Nguyên nhân là do gõ nhầm lệnh trong PowerShell (ví dụ gõ nhầm `git > son`). Xóa ngay bằng lệnh:
```powershell
Remove-Item -Path "git", "son" -Force -ErrorAction SilentlyContinue
```

### Trường hợp 4: Lệnh `git push` bị treo / đứng hình
* **Nguyên nhân:** Trên Windows, Git gọi tiện ích Git Credential Manager để xác thực với GitHub và đang chờ bạn đăng nhập qua trình duyệt hoặc nhập Token.
* **Cách xử lý:** Mở trực tiếp Terminal trong VS Code và gõ lệnh đẩy. Trình duyệt sẽ bật lên cửa sổ xác thực GitHub, bạn chỉ cần bấm **Authorize** một lần là xong.

---

## 5. Checklist 30 giây trước khi bấm Commit & Push

- [ ] Tôi đã chạy `git status` và chỉ thấy các file code tôi thực sự sửa.
- [ ] Không có file `.env`, `venv/`, `.venv/` hay `db.sqlite3` trong danh sách staged.
- [ ] Code backend đã chạy thử `python manage.py test` không bị lỗi cú pháp / 500.
- [ ] Code frontend đã chạy thử `npm run build` không bị lỗi TypeScript.
- [ ] Nhánh đích của PR trên GitHub đã chọn đúng là **`dev1`**.
