# File này chứa hai môi trường chạy local: backend và frontend.
# Docker Compose chọn target phù hợp cho từng service.

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
