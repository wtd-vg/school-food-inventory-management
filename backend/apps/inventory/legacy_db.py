"""ISSUE-001: nhận diện và nâng cấp DB đã migrate ở bản f00048d.

Tại f00048d, `0008_dish_schoolclass_issue_issueline_recipecomponent` tạo thêm bảng inventory_issue và
inventory_issueline. Khi gộp SF43, migration này được sửa (giữ tên) để bỏ hai bảng đó vì
`0008_issue_contract` (SF25) mới là nơi tạo chúng. DB đã chạy bản cũ vì vậy vẫn còn hai bảng, và
`migrate` dừng ở `0008_issue_contract` với lỗi `relation "inventory_issue" already exists`.

Cách xử lý: không sửa migration đã merge, không `--fake`. Nếu hai bảng cũ còn rỗng và đúng schema của
bản cũ thì xóa chúng để `0008_issue_contract` tạo lại theo contract mới. Có dữ liệu hoặc schema lạ thì
dừng để người phụ trách lập kế hoạch chuyển dữ liệu riêng.
"""

from dataclasses import dataclass

from django.db import transaction
from django.db.migrations.recorder import MigrationRecorder

APP = "inventory"
LEGACY_MIGRATION = "0008_dish_schoolclass_issue_issueline_recipecomponent"
CONTRACT_MIGRATION = "0008_issue_contract"
# Thứ tự xóa: bảng con trước.
LEGACY_TABLES = ("inventory_issueline", "inventory_issue")
# Cột do 0008 bản f00048d tạo ra (đúng như CreateModel Issue/IssueLine của bản đó).
LEGACY_COLUMNS = {
    "inventory_issue": frozenset({"id", "code", "date", "note", "status", "posted_at", "created_by_id"}),
    "inventory_issueline": frozenset({"id", "quantity", "unit_cost", "food_id", "issue_id"}),
}

UP_TO_DATE = "up_to_date"
CLEAN = "clean"
LEGACY_EMPTY = "legacy_empty"
LEGACY_HAS_DATA = "legacy_has_data"
BLOCKED = "blocked"
UNKNOWN = "unknown"
NEEDS_PERSON = {LEGACY_HAS_DATA, BLOCKED, UNKNOWN}


@dataclass(frozen=True)
class Facts:
    applied: frozenset  # tên migration app inventory đã ghi trong django_migrations
    tables: dict  # bảng cũ đang tồn tại -> (số dòng, tập cột)
    dependents: tuple  # ràng buộc FK từ bảng khác trỏ vào hai bảng cũ


@dataclass(frozen=True)
class Diagnosis:
    state: str
    message: str


def collect_facts(connection):
    recorder = MigrationRecorder(connection)
    applied = frozenset(
        name for app, name in recorder.applied_migrations() if app == APP
    ) if recorder.has_table() else frozenset()
    existing = set(connection.introspection.table_names())
    tables = {}
    dependents = ()
    with connection.cursor() as cursor:
        for table in LEGACY_TABLES:
            if table not in existing:
                continue
            cursor.execute(f"SELECT COUNT(*) FROM {connection.ops.quote_name(table)}")
            count = cursor.fetchone()[0]
            columns = frozenset(c.name for c in connection.introspection.get_table_description(cursor, table))
            tables[table] = (count, columns)
        if tables:
            cursor.execute(
                """
                SELECT conrelid::regclass::text, conname
                FROM pg_constraint
                WHERE contype = 'f'
                  AND confrelid = ANY(%s::regclass[])
                  AND NOT (conrelid = ANY(%s::regclass[]))
                ORDER BY 1, 2
                """,
                [list(tables), list(tables)],
            )
            dependents = tuple(f"{rel}.{name}" for rel, name in cursor.fetchall())
    return Facts(applied=applied, tables=tables, dependents=dependents)


def diagnose(facts):
    if CONTRACT_MIGRATION in facts.applied:
        return Diagnosis(UP_TO_DATE, "DB đã chạy 0008_issue_contract: bảng phiếu xuất là bản mới, không cần xử lý.")
    if not facts.tables:
        return Diagnosis(CLEAN, "Không có bảng phiếu xuất cũ: chạy `migrate` bình thường.")
    if LEGACY_MIGRATION not in facts.applied:
        return Diagnosis(
            UNKNOWN,
            "Có bảng " + ", ".join(sorted(facts.tables)) + " nhưng django_migrations không ghi "
            f"{LEGACY_MIGRATION}. Không rõ bảng do đâu tạo: dừng, cần người kiểm tra.",
        )
    wrong = [t for t, (_, cols) in facts.tables.items() if cols != LEGACY_COLUMNS[t]]
    if wrong:
        return Diagnosis(
            UNKNOWN,
            "Schema khác bản f00048d ở bảng " + ", ".join(sorted(wrong)) + ": dừng, cần người kiểm tra.",
        )
    if facts.dependents:
        return Diagnosis(
            BLOCKED,
            "Bảng khác đang tham chiếu tới bảng phiếu xuất cũ (" + ", ".join(facts.dependents) + "): dừng.",
        )
    with_rows = {t: n for t, (n, _) in facts.tables.items() if n}
    if with_rows:
        return Diagnosis(
            LEGACY_HAS_DATA,
            "Bảng phiếu xuất cũ còn dữ liệu (" + ", ".join(f"{t}={n} dòng" for t, n in sorted(with_rows.items()))
            + "). Không tự xóa: cần kế hoạch chuyển dữ liệu riêng.",
        )
    return Diagnosis(
        LEGACY_EMPTY,
        "DB bản f00048d với bảng phiếu xuất cũ rỗng (" + ", ".join(sorted(facts.tables))
        + "): có thể xóa hai bảng rỗng rồi chạy `migrate`.",
    )


def drop_empty_legacy_tables(connection):
    """Xóa hai bảng cũ khi và chỉ khi vẫn đúng trạng thái LEGACY_EMPTY, kiểm lại dưới khóa.

    Không dùng CASCADE: nếu có thứ gì phụ thuộc, PostgreSQL báo lỗi và transaction rollback.
    """
    with transaction.atomic(using=connection.alias):
        tables = [t for t in LEGACY_TABLES if t in set(connection.introspection.table_names())]
        if tables:
            with connection.cursor() as cursor:
                cursor.execute(
                    "LOCK TABLE " + ", ".join(connection.ops.quote_name(t) for t in tables)
                    + " IN ACCESS EXCLUSIVE MODE"
                )
        diagnosis = diagnose(collect_facts(connection))
        if diagnosis.state != LEGACY_EMPTY:
            return diagnosis, []
        with connection.cursor() as cursor:
            for table in tables:  # đã theo thứ tự con trước
                cursor.execute(f"DROP TABLE {connection.ops.quote_name(table)}")
    return diagnosis, tables
