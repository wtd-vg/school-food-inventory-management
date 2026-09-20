"""Các API đơn giản đầu tiên của dự án."""

from django.db import connection
from django.http import JsonResponse


def hello(request):
    """Kiểm tra cả Django và PostgreSQL rồi trả JSON cho React."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        database_result = cursor.fetchone()[0]

    return JsonResponse(
        {
            "message": "React đã gọi được Django.",
            "database": "PostgreSQL đã kết nối." if database_result == 1 else "Có lỗi.",
        }
    )
