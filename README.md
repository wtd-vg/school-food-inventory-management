# SchoolFood — khung cơ bản cho team

Đây là skeleton để học và phát triển dần, chưa phải sản phẩm hoàn chỉnh.

Mục tiêu duy nhất hiện tại là hiểu được luồng:

```text
Trình duyệt → React → Django → PostgreSQL
```

## Tài liệu dành cho team 6 người

Bắt đầu bằng [hướng dẫn chung](outputs/team-6/SchoolFood_HuongDan_Chung.md) và [Quy chuẩn Git & Workflow](GIT_WORKFLOW.md),
sau đó mở [checklist TV1–TV6](outputs/team-6/SchoolFood_Checklist_6_ThanhVien.xlsx)
và tra mã SF của mình trong [hướng dẫn từng task](outputs/team-6/SchoolFood_HuongDan_Task.md).

Mọi thành viên **bắt buộc đọc [Quy chuẩn Git](GIT_WORKFLOW.md)** trước khi code để tránh commit file rác/venv và nhầm lẫn nhánh.

Ngày đầu chỉ làm SF01–SF06, mỗi người một task làm quen.
Các model/API trong tài liệu là kế hoạch phát triển dần, chưa có trong code.
Bộ trong `outputs/team-6/` là bản hiện hành; `outputs/project-foundation-update/` là bản cũ để tham khảo.

## 1. Những gì đang có

- `db`: PostgreSQL lưu dữ liệu.
- `backend`: Django cung cấp API.
- `frontend`: React hiển thị giao diện.
- Docker Compose khởi động cả ba phần bằng một lệnh.
- Một API mẫu kiểm tra kết nối database.
- Một trang React gọi API mẫu và hiển thị kết quả.

Chưa có đăng nhập, danh mục, nhập kho, xuất kho, kiểm kê, báo cáo hoặc deploy. Team sẽ thêm từng phần sau khi hiểu skeleton.

## 2. Chạy dự án

Team lấy bản nền từ nhánh `dev1`. Nếu chưa có repository:

```sh
git clone --branch dev1 https://github.com/wtd-vg/school-food-inventory-management.git
cd school-food-inventory-management
```

Nếu đã clone, đảm bảo đã lưu công việc trên nhánh riêng và `git status` không còn thay đổi dở dang, rồi:

```sh
git fetch origin
git switch dev1
git pull --ff-only origin dev1
```

Nếu chưa có nhánh local `dev1`, thay lệnh switch bằng `git switch --track origin/dev1`.
Khi nhận task, tạo nhánh `feat/SFxx-ten-ngan` từ `dev1` mới nhất và mở PR về `dev1` để TV1 duyệt.

Cài Docker Desktop, mở PowerShell tại thư mục dự án rồi chạy:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Ở terminal khác, tạo các bảng mặc định của Django:

```powershell
docker compose exec backend python manage.py migrate
```

Mở `http://localhost:5173`.

Nếu mọi thứ đúng, trang sẽ hiển thị:

```text
React đã gọi được Django. PostgreSQL đã kết nối.
```

Dừng dự án:

```powershell
docker compose down
```

Lệnh trên không xóa dữ liệu. Đừng thêm `-v` nếu chưa muốn xóa database local.

## 3. Hiểu từng file

### File ở thư mục gốc

| File | Giải thích |
| --- | --- |
| `README.md` | File đang đọc; cách hiểu và chạy dự án. |
| `architecture.md` | Những quyết định kỹ thuật rất ngắn của team. |
| `task_on_progress.md` | Việc đang làm và bước tiếp theo. |
| `compose.yaml` | Nói cho Docker biết cần chạy database, backend và frontend. |
| `Dockerfile` | Nói cho Docker cách tạo môi trường Python và Node. |
| `.env.example` | Giá trị mẫu cho PostgreSQL local. Copy thành `.env`. |
| `.gitignore` | Danh sách file local không được đưa lên Git. |
| `.dockerignore` | Danh sách file không cần copy vào Docker image. |

Thư mục `outputs/` chứa tài liệu, không tham gia chạy ứng dụng. Dùng đúng bộ `team-6` được liên kết ở đầu README.

### Backend

```text
backend/
  manage.py
  requirements.txt
  schoolfood/
    settings.py
    urls.py
    asgi.py
    wsgi.py
  apps/
    inventory/
      apps.py
      urls.py
      views.py
      tests.py
```

- `manage.py`: lệnh điều khiển Django như `migrate`, `test`, `runserver`.
- `requirements.txt`: hai thư viện Python cần cài: Django và driver PostgreSQL.
- `settings.py`: cấu hình app, middleware và kết nối database.
- `schoolfood/urls.py`: đưa mọi URL bắt đầu bằng `/api/` vào app inventory.
- `asgi.py`, `wsgi.py`: file Django tạo sẵn để server khởi động; chưa cần sửa.
- `inventory/apps.py`: khai báo app inventory với Django.
- `inventory/urls.py`: nối `/api/hello/` với hàm `hello`.
- `inventory/views.py`: chạy `SELECT 1` trên PostgreSQL và trả JSON.
- `inventory/tests.py`: gọi API mẫu và kiểm tra kết quả.
- Các file `__init__.py`: đánh dấu thư mục Python; để trống và không cần sửa.

### Frontend

```text
frontend/
  index.html
  package.json
  package-lock.json
  tsconfig.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    styles.css
```

- `index.html`: trang HTML có vị trí để React được gắn vào.
- `package.json`: lệnh chạy và danh sách thư viện JavaScript.
- `package-lock.json`: npm tự sinh để mọi máy cài cùng phiên bản; không sửa tay.
- `tsconfig.json`: cấu hình TypeScript; giai đoạn đầu không cần sửa.
- `vite.config.ts`: cấu hình server frontend và chuyển `/api` sang Django.
- `main.tsx`: điểm bắt đầu của React.
- `App.tsx`: giao diện duy nhất; gọi `/api/hello/` rồi hiển thị kết quả.
- `styles.css`: CSS tối thiểu cho trang.

## 4. Request chạy như thế nào

Khi trang được mở:

1. `main.tsx` hiển thị component `App`.
2. `App.tsx` gọi `fetch("/api/hello/")`.
3. Vite đọc `vite.config.ts` và chuyển request sang Django.
4. Django đọc `schoolfood/urls.py` rồi `inventory/urls.py`.
5. Hàm `hello` trong `inventory/views.py` hỏi PostgreSQL bằng `SELECT 1`.
6. Django trả JSON cho React.
7. React đưa nội dung JSON lên màn hình.

Đây là vòng cơ bản mà mọi feature sau này đều mở rộng từ đó.

## 5. Các lệnh cần biết

```powershell
# Khởi động
docker compose up

# Tạo/cập nhật bảng database
docker compose exec backend python manage.py migrate

# Chạy test Django
docker compose exec backend python manage.py test

# Kiểm tra frontend có build được không
docker compose exec frontend npm run build

# Xem log backend
docker compose logs -f backend

# Dừng
docker compose down
```

## 6. Team làm gì tiếp theo

Chỉ sau khi tất cả thành viên tự giải thích được vòng request ở mục 4:

1. Tạo model `Category`.
2. Chạy migration.
3. Tạo API liệt kê category.
4. Hiển thị category trên React.
5. Viết một test cho API.

Chưa làm auth, UI library, CI, cloud database, Render hoặc domain. Những phần đó sẽ được thêm khi team thật sự cần và hiểu lý do.

## 7. File local có thể bỏ qua

- `.venv/`: môi trường Python cài trên máy.
- `frontend/node_modules/`: thư viện JavaScript đã cài.
- `__pycache__/`, `.ruff_cache/`, `.mypy_cache/`: cache công cụ.
- `.tmp/`: file QA tạm.

Các thư mục này có thể sinh lại và không chứa nghiệp vụ của dự án.
