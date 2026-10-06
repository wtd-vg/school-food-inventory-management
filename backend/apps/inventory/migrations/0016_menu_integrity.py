"""BE-03 / SF49: bất biến thực đơn ở PostgreSQL.

- MenuVersion, MenuVersionItem: không thêm/sửa/xóa khi version đã có hiệu lực (effective_from ≤ hôm nay
  theo giờ Việt Nam). Version tương lai còn sửa/xóa được.
- DayMenuSnapshot: chỉ thêm, không sửa/xóa.
"""

from django.db import migrations

FORWARD_SQL = """
CREATE FUNCTION be03_menu_today() RETURNS date AS $$
    SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
$$ LANGUAGE sql STABLE;

CREATE FUNCTION be03_menu_version_guard() RETURNS trigger AS $$
BEGIN
    IF OLD.effective_from <= be03_menu_today() THEN
        RAISE EXCEPTION 'Menu version already in effect is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'menu_version_immutable';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.effective_from <= be03_menu_today() THEN
        RAISE EXCEPTION 'Menu version cannot move into the past'
            USING ERRCODE = '23514', CONSTRAINT = 'menu_version_future_only';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER be03_menu_version_guard BEFORE UPDATE OR DELETE ON inventory_menuversion
FOR EACH ROW EXECUTE FUNCTION be03_menu_version_guard();

CREATE FUNCTION be03_menu_item_guard() RETURNS trigger AS $$
DECLARE starts date;
BEGIN
    SELECT effective_from INTO starts FROM inventory_menuversion
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
    IF starts IS NOT NULL AND starts <= be03_menu_today() THEN
        RAISE EXCEPTION 'Menu version already in effect is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'menu_version_immutable';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.version_id <> OLD.version_id THEN
        RAISE EXCEPTION 'Menu item cannot move to another version'
            USING ERRCODE = '23514', CONSTRAINT = 'menu_item_version_immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER be03_menu_item_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_menuversionitem
FOR EACH ROW EXECUTE FUNCTION be03_menu_item_guard();

CREATE FUNCTION be03_day_menu_snapshot_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Day menu snapshot is immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'day_menu_snapshot_immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER be03_day_menu_snapshot_append_only BEFORE UPDATE OR DELETE ON inventory_daymenusnapshot
FOR EACH ROW EXECUTE FUNCTION be03_day_menu_snapshot_append_only();
"""

REVERSE_SQL = """
DROP TRIGGER be03_day_menu_snapshot_append_only ON inventory_daymenusnapshot;
DROP TRIGGER be03_menu_item_guard ON inventory_menuversionitem;
DROP TRIGGER be03_menu_version_guard ON inventory_menuversion;
DROP FUNCTION be03_day_menu_snapshot_append_only();
DROP FUNCTION be03_menu_item_guard();
DROP FUNCTION be03_menu_version_guard();
DROP FUNCTION be03_menu_today();
"""


class Migration(migrations.Migration):
    dependencies = [("inventory", "0015_menu")]
    operations = [migrations.RunSQL(FORWARD_SQL, REVERSE_SQL)]
