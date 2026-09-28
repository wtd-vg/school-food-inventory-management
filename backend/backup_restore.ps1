# Script ho tro SF38: Backup va restore DB
# Yeu cau: Cai dat PostgreSQL client (pg_dump, pg_restore) tren may hoac dung qua Docker

Write-Host "--- DANG BACKUP TU STAGING ---"
$stagingUrl = $env:DATABASE_URL
if (-not $stagingUrl) {
    Write-Host "Loi: Khong tim thay DATABASE_URL."
    exit
}

# Dung pg_dump
# Luu y: Ban phai co pg_dump tren may de chay lenh nay
pg_dump $stagingUrl -F c -f "staging_backup.dump"
if ($LASTEXITCODE -eq 0) {
    Write-Host "Backup thanh cong vao staging_backup.dump"
} else {
    Write-Host "Loi backup."
    exit
}

Write-Host "--- DANG RESTORE VAO DB THU ---"
$testUrl = Read-Host "Nhap DATABASE_URL cua DB thu (restore): "

if ($testUrl) {
    pg_restore -d $testUrl -1 "staging_backup.dump"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Restore thanh cong."
    } else {
        Write-Host "Loi restore."
    }
}
