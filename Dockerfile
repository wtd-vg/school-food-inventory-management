# File này chứa môi trường local (backend, frontend) cho compose.yaml
# và môi trường production (backend-prod, web-prod) cho compose.prod.yaml.

# ----- Backend Django -----
FROM python:3.13-slim AS backend

WORKDIR /app

# Cài dependency Python trước để Docker có thể cache bước này.
COPY backend/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt

# Copy source code Django vào image.
COPY backend/ ./

EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# ----- Frontend React -----
FROM node:22-alpine AS frontend

WORKDIR /app

# package-lock.json giúp mọi máy cài cùng phiên bản dependency.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source code React vào image.
COPY frontend/ ./

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ----- Production: Django + gunicorn (SF38) -----
FROM backend AS backend-prod

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# Gom file tĩnh của admin; giá trị env ở đây chỉ để settings nạp được lúc build (BE-04 bắt buộc có
# khóa mã hóa khi DEBUG=False). Không phải bí mật, không nằm trong image lúc chạy.
RUN DEBUG=False SECRET_KEY=build-only-not-secret-build-only-not-secret-build-only ALLOWED_HOSTS=localhost \
    FIELD_ENCRYPTION_KEYS=build-only-not-a-key CONTACT_HASH_KEY=build-only-not-a-key \
    python manage.py collectstatic --noinput

# Không chạy tiến trình web bằng root.
RUN useradd --system --no-create-home app
USER app

# Số worker lấy từ WEB_CONCURRENCY (gunicorn tự đọc biến này).
CMD ["gunicorn", "schoolfood.wsgi:application", "--bind", "0.0.0.0:8000", "--access-logfile", "-", "--timeout", "60"]

# ----- Production: build frontend -----
FROM frontend AS frontend-build

RUN npm run build

# ----- Production: nginx phục vụ SPA, /static và chuyển /api, /admin sang Django -----
FROM nginx:1.27-alpine AS web-prod

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/dist /usr/share/nginx/html
COPY --from=backend-prod /app/staticfiles /usr/share/nginx/static

EXPOSE 80
