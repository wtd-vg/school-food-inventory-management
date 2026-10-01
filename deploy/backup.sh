#!/usr/bin/env bash
# BE-17: sao lưu PostgreSQL, giữ bản hoàn tất trong 14 ngày.
set -euo pipefail
umask 077
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
mkdir -p backups
backup_file="backups/schoolfood-$(date +%Y%m%d-%H%M%S).sql.gz"
partial_file="$(mktemp "${backup_file}.XXXXXX.partial")"
trap 'rm -f -- "$partial_file"' EXIT

docker compose --env-file .env.prod -f compose.prod.yaml exec -T db \
    sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$partial_file"
gzip -t "$partial_file"
mv -- "$partial_file" "$backup_file"

# SF73: ảnh suất ăn thực tế (volume media của backend).
media_file="backups/media-$(date +%Y%m%d-%H%M%S).tar.gz"
media_partial="$(mktemp "${media_file}.XXXXXX.partial")"
trap 'rm -f -- "$partial_file" "$media_partial"' EXIT
docker compose --env-file .env.prod -f compose.prod.yaml exec -T backend \
    tar -czf - -C /app media > "$media_partial"
gzip -t "$media_partial"
mv -- "$media_partial" "$media_file"

find backups -maxdepth 1 -type f \( -name 'schoolfood-*.sql.gz' -o -name 'media-*.tar.gz' \) -mmin +20160 -delete
printf '%s\n' "$repo_dir/$backup_file" "$repo_dir/$media_file"
