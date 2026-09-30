# SF37 · Đề xuất ngân sách và thiết kế deploy

- **Người làm:** TV1 · **Reviewer:** TV6
- **Ngày:** 30/09/2026 (cập nhật theo định hướng AWS + tên miền + Cloudflare)
- **Nhánh:** `docs/sf37-deploy-plan`

> **Trạng thái: BẢN ĐỀ XUẤT, CHỜ CHỦ DỰ ÁN DUYỆT.**
>
> - M6 chưa mở, vì SF36 (nghiệm thu MVP local) chưa đạt.
> - Tài liệu này **không** tạo tài khoản, **không** mua dịch vụ, **không** thêm file cấu hình deploy.
> - Điều kiện đạt của SF37: *"có quyết định chi phí và kế hoạch deploy được chủ dự án chấp thuận"*. Khi chủ dự án ký mục 7 mới được tính xong.
> - Giá tra cứu ngày 30/09/2026 từ các trang tổng hợp (nguồn ở cuối). **Phải xem lại trang giá chính thức ngay trước khi mua.**
> - Tỷ giá tham khảo: Vietcombank bán ra 26.170 đ/USD (29/09/2026).

## 1. Nhu cầu thực tế cần phục vụ

- **Quy mô:** một trường, vài chục tài khoản (bếp, kế toán, ban giám hiệu). Dùng chủ yếu 6:00–14:00 ngày học.
- **Dữ liệu:** dưới 1 GB trong vài năm (danh mục, chứng từ kho, số suất theo lớp, không có ảnh). Tải rất nhẹ: 1 web + 1 PostgreSQL cỡ nhỏ là đủ.
- **Ràng buộc kỹ thuật đang có:**
  - PostgreSQL bắt buộc (trigger SF19, SF25, SF31, SF43), không chạy SQLite.
  - Session cookie + CSRF, nên frontend và API nên **cùng một domain**.
- **Dữ liệu cá nhân:** hiện chỉ có tài khoản nhân viên và SĐT nhà cung cấp. G2 chỉ lưu *tổng suất theo lớp*, không lưu học sinh.
  - Nếu sau này lưu học sinh hoặc phụ huynh (canvas có màn "Gửi phụ huynh"), phải xem lại theo **Luật Bảo vệ dữ liệu cá nhân (hiệu lực 01/01/2026)**, nhất là dữ liệu trẻ em và việc chuyển dữ liệu ra nước ngoài.
  - Cần hỏi nhà trường/pháp chế; nhóm không tự kết luận.

## 2. Hướng đã chọn: AWS + tên miền riêng + Cloudflare

Chủ dự án định hướng (30/09/2026): chạy trên **AWS**, dùng **tên miền riêng**, DNS và HTTPS qua **Cloudflare**. **Chưa deploy**; M6 mở theo mục 6.

### 2.1 Ba cách dựng trên AWS (region Singapore `ap-southeast-1`)

| | **AWS-1 · Lightsail một máy** | **AWS-2 · Lightsail + Lightsail Database** | AWS-3 · EC2 + RDS |
| --- | --- | --- | --- |
| **Thành phần** | 1 instance Small-2GB (2 vCPU, 2 GB, 60 GB SSD, 3 TB truyền tải). Docker Compose chạy Django (gunicorn) và PostgreSQL trên cùng máy | Instance Micro-1GB hoặc Small-2GB cho app; PostgreSQL managed gói nhỏ nhất (1 GB RAM, 40 GB SSD) | EC2 t4g.small + RDS db.t4g.micro (2 vCPU, 1 GiB), có thể thêm ALB |
| **Giá/tháng** | $12 + snapshot ~$0,05/GB·tháng ≈ **$13 ≈ 340.000 đ** | $7–12 + $15 ≈ **$22–27 ≈ 575.000–705.000 đ** | EC2 + RDS (~$0,016/giờ ở us-east-1, Singapore đắt hơn) + gp3 + phí IPv4 công khai (~$3,6/IP) → thường **> $30**; tính lại bằng AWS Pricing Calculator |
| **Sao lưu DB** | Tự làm: `pg_dump` hằng đêm lên S3 hoặc Drive trường + snapshot máy tự động của Lightsail | Backup tự động, khôi phục theo thời điểm của Lightsail DB | RDS backup tự động và khôi phục theo thời điểm |
| **Công vận hành** | Trung bình (cập nhật OS và PostgreSQL, theo dõi ổ đĩa) | Thấp–trung bình | Cao nhất (VPC, security group, IAM, ALB) |
| **Hợp khi** | Thí điểm 1 trường, ngân sách thấp, nhóm biết Docker | Muốn DB có người lo backup; ngân sách ~600–700 nghìn/tháng | Quy mô nhiều trường hoặc cần mở rộng |

Lightsail tính trọn gói: bundle có kèm IPv4 và lượng truyền tải. Gói Nano/Micro rẻ hơn nhưng **1 GB RAM là quá sát** khi chạy chung Django + PostgreSQL, nên không khuyến nghị cho AWS-1.

### 2.2 Cloudflare (gói Free)

- **DNS:** trỏ nameserver của domain về Cloudflare. Bản ghi `A bep.<domain>` trỏ tới IP tĩnh của Lightsail, **bật proxy** (đám mây cam) để ẩn IP gốc và có chống DDoS cơ bản.
- **HTTPS:**
  - Chế độ SSL/TLS chọn **Full (strict)**.
  - Trình duyệt ↔ Cloudflare dùng chứng chỉ Universal SSL miễn phí.
  - Cloudflare ↔ máy chủ dùng **Cloudflare Origin Certificate** cài trên Caddy/Nginx. Không dùng chế độ "Flexible" vì đoạn Cloudflare ↔ máy chủ sẽ không mã hoá.
  - Bật "Always Use HTTPS". HSTS bật sau khi chạy ổn 1–2 tuần.
- **Cache:** bypass cho `/api/*` và `/admin/*` (dữ liệu có phiên đăng nhập, không được cache). Chỉ cache file build tĩnh (`/assets/*`).
- **Tường lửa máy chủ:**
  - Cổng 443 chỉ nhận **dải IP của Cloudflare**, để không ai vòng qua Cloudflare đánh thẳng vào máy.
  - Cổng 22 (SSH) chỉ mở cho IP quản trị, hoặc dùng SSH qua console Lightsail.
- **Django sau proxy:**
  - `SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")`.
  - `CSRF_TRUSTED_ORIGINS = ["https://bep.<domain>"]`.
  - Nếu cần IP thật của người dùng (ghi log), đọc header `CF-Connecting-IP`.

### 2.3 Tên miền

- Domain **đứng tên nhà trường hoặc chủ dự án**, không đứng tên sinh viên.
- Tên miền `.vn` phải mua qua nhà đăng ký Việt Nam, rồi đổi nameserver sang Cloudflare. **Hỏi nhà đăng ký trước** xem có cho trỏ nameserver `.vn` ra DNS nước ngoài không, và thủ tục ra sao.
- `.com` có thể mua thẳng ở Cloudflare Registrar (giá gốc).
- Có thể dùng subdomain `bep.<domain>` cho app, giữ domain gốc cho việc khác.

### 2.4 Chi phí dự kiến (AWS-1)

| Hạng mục | /tháng | /năm |
| --- | --- | --- |
| Lightsail Small-2GB | $12 | $144 |
| Snapshot tự động (~20–40 GB) | ~$1–2 | ~$12–24 |
| Cloudflare Free | 0 | 0 |
| Tên miền | — | theo giá nhà đăng ký (`.vn` hoặc `.com`) |
| **Cộng (chưa tính domain)** | **≈ $13–14 ≈ 340.000–370.000 đ** | **≈ 4,1–4,4 triệu đ** |

**Tín dụng AWS cho tài khoản mới:**

- Nhận $100 khi đăng ký, làm thêm các hoạt động để được tối đa $100 nữa.
- Gói miễn phí hết hạn sau **6 tháng hoặc khi hết credit**.
- Có thể dùng cho giai đoạn thí điểm, nhưng **đừng tính vào ngân sách dài hạn**. Kiểm tra xem Lightsail có nằm trong phạm vi dùng credit của gói free không trước khi dựa vào.

## 3. Khuyến nghị

1. **Thí điểm: AWS-1** (Lightsail Small-2GB + Docker Compose + Cloudflare Free), khoảng **340–370 nghìn đ/tháng**. Nếu có ngân sách ~600–700 nghìn đ/tháng và muốn giảm rủi ro mất dữ liệu, chọn **AWS-2** (DB managed có khôi phục theo thời điểm).
2. **Staging:** một instance Lightsail rẻ riêng, hoặc chạy trên máy local qua Cloudflare Tunnel khi cần demo. Dữ liệu giả; không dùng chung DB với production (SF38).
3. **AWS Budgets:** đặt cảnh báo ở **$15** và **$25**/tháng, gửi email chủ dự án + TV1. Muốn tăng gói phải báo trước.
4. **Không dùng EC2 + RDS + ALB** ở quy mô một trường: đắt gấp 2–3 lần và nhiều cấu hình mạng dễ sai.

### Phương án ngoài AWS đã cân nhắc (tham khảo)

| Phương án | Giá/tháng | Lý do không chọn |
| --- | --- | --- |
| Render web + Render Postgres | ≈ $14,3 | Chủ dự án chọn AWS |
| Render + Neon | $12–15 | Chủ dự án chọn AWS |
| VPS Việt Nam (Bizfly 2 vCPU/4 GB) | 240.000 đ + VAT | Giữ làm phương án dự phòng nếu yêu cầu dữ liệu ở Việt Nam |
| Hetzner CX23 | €5,99 | Độ trễ từ Việt Nam cao |

## 4. Tài khoản, domain, quyền sở hữu (điều kiện SF42)

- **Tài khoản AWS** (root) đứng tên **email của nhà trường hoặc email nhóm dùng chung**.
  - Root chỉ dùng để thanh toán và khôi phục, bật **MFA**. Làm việc hằng ngày bằng IAM user hoặc IAM Identity Center có MFA.
  - Tối thiểu 2 người quản trị. Không tạo access key cho root.
- **Tài khoản Cloudflare** cũng đứng tên email trường, có 2 thành viên quản trị, bật 2FA.
- **Thanh toán:** thẻ của đơn vị hoặc chủ dự án. Không để thẻ cá nhân sinh viên sắp ra trường.
- **Tên miền riêng:**
  - Đứng tên nhà trường hoặc chủ dự án. Bật khoá chuyển tên miền và tự gia hạn.
  - Ghi vào sổ bàn giao ngày hết hạn và tài khoản nhà đăng ký (SF42).
  - DNS quản lý ở Cloudflare (mục 2.2–2.3).
- **Secret** (SECRET_KEY, mật khẩu DB, mật khẩu admin, Origin Certificate private key):
  - Nằm trong file `.env` trên máy chủ, quyền 600, **hoặc** AWS SSM Parameter Store.
  - **Không** ghi vào repo, Excel hay chat nhóm.

## 5. Thiết kế production (làm ở SF38–SF41 khi M6 mở)

```
Trình duyệt ──HTTPS──► Cloudflare (DNS + proxy, Universal SSL, cache /assets/*, bypass /api/* /admin/*)
                          │ HTTPS · Origin Certificate · chế độ Full (strict)
                          ▼
              Lightsail Small-2GB (Singapore), IP tĩnh, tường lửa chỉ nhận dải IP Cloudflare ở cổng 443
              └─ Docker Compose
                  ├─ caddy     :443 → reverse proxy tới web:8000
                  ├─ web       Django + gunicorn; phục vụ build Vite qua WhiteNoise
                  │            (/, /api/*, /admin/* cùng một domain)
                  └─ db        PostgreSQL 17, volume riêng, không mở cổng ra ngoài
              Backup: pg_dump hằng đêm → S3 (bucket riêng, bật versioning) + snapshot Lightsail hằng ngày
```

(AWS-2: bỏ service `db`; `DATABASE_URL` trỏ tới Lightsail managed database, bật SSL.)

- **Một service, cùng domain.** Session và CSRF chạy như local, không cần CORS.
  - Image build nhiều tầng: tầng node build `frontend/dist`, tầng python copy vào static, chạy `collectstatic`.
- **Dependency cần duyệt khi mở M6:** `gunicorn` (server production) và `whitenoise` (phục vụ static). Hiện `architecture.md` cấm tự thêm dependency, nên đưa vào PR SF40 để TV1 duyệt.
- **Lệnh release** mỗi lần deploy: `python manage.py migrate --noinput`, sau đó `python manage.py check --deploy`.
  - Migration có trigger PostgreSQL. **Không** rollback migration trên production như thao tác thường ngày.
- **Biến môi trường production:**

| Biến | Giá trị |
| --- | --- |
| `DEBUG` | `False` |
| `SECRET_KEY` | chuỗi ngẫu nhiên ≥ 50 ký tự, sinh riêng cho production |
| `ALLOWED_HOSTS` | `bep.<truong>.edu.vn` (không dùng `*`) |
| `CSRF_TRUSTED_ORIGINS` | `https://bep.<truong>.edu.vn` |
| `DATABASE_URL` | AWS-1: `postgres://…@db:5432/…` trong mạng Compose; AWS-2: endpoint Lightsail DB, thêm `?sslmode=require` |
| `SECURE_SSL_REDIRECT` | `True`; cùng `SECURE_PROXY_SSL_HEADER` vì đứng sau Cloudflare/Caddy |
| HSTS | bắt đầu `3600` giây; ổn định 1–2 tuần mới tăng lên 1 năm |

- **Việc phải sửa trong `settings.py` trước khi public** (giao TV4 ở SF40; hiện code SF38/SF40 đã merge sớm):
  1. Khi `DEBUG=False` mà thiếu `SECRET_KEY` hoặc `ALLOWED_HOSTS`: **dừng khởi động**. Bỏ giá trị `SECRET_KEY` mặc định đang nằm trong repo.
  2. `ALLOWED_HOSTS` mặc định không được là `*`.
  3. Đọc `CSRF_TRUSTED_ORIGINS` từ biến môi trường.
  4. Log ra stdout, không in traceback cho người dùng (đã có `DEBUG=False`).

  Mẫu:

  ```python
  DEBUG = os.getenv("DEBUG", "True").lower() == "true"
  SECRET_KEY = os.getenv("SECRET_KEY") or ("dev-only-insecure-key" if DEBUG else None)
  if not SECRET_KEY:
      raise ImproperlyConfigured("SECRET_KEY bắt buộc khi DEBUG=False")
  ALLOWED_HOSTS = [h for h in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,backend").split(",") if h]
  CSRF_TRUSTED_ORIGINS += [o for o in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",") if o]
  ```

- **Sao lưu và khôi phục (SF38, SF42):**
  - `pg_dump -Fc` **hằng đêm** lên S3 (giữ 30 bản), thêm một bản mỗi tuần vào Drive của trường. Snapshot Lightsail tự động hằng ngày.
  - Diễn tập khôi phục vào DB thử **mỗi tháng**, ghi số bản ghi trước và sau.
- **Giám sát tối thiểu:** health check `/api/hello/` (Lightsail metric alarm hoặc UptimeRobot); AWS Budgets báo khi chi phí vượt trần; cảnh báo ổ đĩa đầy > 80%.

## 6. Kế hoạch mở M6 (sau khi SF36 đạt và mục 7 được ký)

| Bước | Việc | Người |
| --- | --- | --- |
| 1 | Chủ dự án chốt AWS-1 hay AWS-2, trần chi phí, domain, email sở hữu tài khoản AWS và Cloudflare | Chủ dự án + TV1 |
| 2 | Tạo tài khoản AWS và Cloudflare bằng email trường, bật MFA, tạo IAM cho quản trị, đặt AWS Budgets | TV1 |
| 3 | Staging: DB riêng, migrate, backup/restore thử (AC22) | TV2 (SF38) |
| 4 | Build một image có frontend + gunicorn + WhiteNoise; staging gọi API đúng | TV3 (SF39) |
| 5 | Sửa `settings.py` như mục 5; chạy `check --deploy` không cảnh báo nghiêm trọng | TV4 (SF40) |
| 6 | Trỏ nameserver domain về Cloudflare, cài Origin Certificate, chế độ Full (strict), tường lửa chỉ nhận IP Cloudflare; đăng nhập thật, viewer chỉ đọc (AC21) | TV5 (SF41) |
| 7 | Bàn giao: tài khoản, hướng dẫn khôi phục, diễn tập rollback (AC22) | TV6 (SF42) |

## 7. Phần chủ dự án quyết định (điền rồi ký)

| Nội dung | Quyết định |
| --- | --- |
| Phương án (AWS-1 Lightsail một máy / AWS-2 Lightsail + DB managed) | |
| Trần chi phí/tháng và ai thanh toán | |
| Tên miền (đuôi .vn/.com), nhà đăng ký, người giữ tài khoản Cloudflare | |
| Email sở hữu tài khoản AWS/Cloudflare, 2 người quản trị | |
| Dữ liệu được phép lưu ngoài Việt Nam? (có / không) | |
| Người chịu trách nhiệm backup và diễn tập khôi phục | |
| Ngày dự kiến mở M6 | |
| Chữ ký / xác nhận của chủ dự án, ngày | |

## Nguồn giá (tra 30/09/2026, cần kiểm tra lại trên trang chính thức)

- Lightsail Small-2GB $12 (2 vCPU/2 GB/60 GB/3 TB), managed database nhỏ nhất $15 (HA gấp đôi), snapshot $0,05/GB-tháng: [cloudburn.io](https://cloudburn.io/blog/amazon-lightsail-pricing)
- AWS Free Tier: $100 + tối đa $100 credit, gói free hết hạn sau 6 tháng hoặc khi hết credit: [aws.amazon.com](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/)
- RDS db.t4g.micro 2 vCPU/1 GiB, từ $0,016/giờ (giá tham chiếu, khác theo region): [instances.vantage.sh](https://instances.vantage.sh/aws/rds/db.t4g.micro)
- Cloudflare Origin CA và chế độ Full (strict): [developers.cloudflare.com](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)
- Render Postgres (bảng plan, storage $0,30/GB-tháng, Free hết hạn 30 ngày), kiểm tra ngày 26/09/2026: [frontdeskreview.com](https://frontdeskreview.com/software/managed-postgres/render/)
- Render Postgres Basic-256mb ~$7, Basic-1gb ~$20, khôi phục theo thời điểm 3/7 ngày theo workspace: [kuberns.com](https://kuberns.com/blogs/render-postgres-pricing-setup-limits/)
- Render web Starter ~$7 (512 MB), web Free tự "ngủ", workspace Professional $19/người: [deploycloud.app](https://deploycloud.app/blog/render-pricing)
- Neon Free 100 CU-giờ, 0,5 GB, khôi phục 6 giờ; Launch tối thiểu $5, $0,14/CU-giờ, $0,35/GB, khôi phục 7 ngày: [saaspricepulse.com](https://www.saaspricepulse.com/tools/neon)
- Bizfly Cloud VPS 2 vCPU/4 GB/40 GB SSD 240.000 đ/tháng chưa VAT: [bizflycloud.vn](https://bizflycloud.vn/cloud-vps)
- Hetzner CX23 €5,99, tăng giá 2026, thiếu hàng: [cloudhim.com](https://www.cloudhim.com/cloud-costs/hetzner-cx22-pricing-2026)
- Tỷ giá Vietcombank 29/09/2026: [vietnambiz.vn](https://vietnambiz.vn/ty-gia-vietcombank-hom-nay-299-bien-dong-trai-chieu-usd-di-ngang-202692992324955.htm)
- Luật Bảo vệ dữ liệu cá nhân có hiệu lực từ 01/01/2026: [bocongan.gov.vn](https://bocongan.gov.vn/chinh-sach-phap-luat/bai-viet/luat-bao-ve-du-lieu-ca-nhan-chinh-thuc-co-hieu-luc-thi-hanh-tu-ngay-01-01-2026-1767186124)
