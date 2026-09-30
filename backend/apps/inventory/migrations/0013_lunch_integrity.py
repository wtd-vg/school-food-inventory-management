"""SF43: bất biến ngày ăn ở PostgreSQL.

- LunchDay: version tăng đúng 1 mỗi lần sửa (khóa lạc quan); ngày không đổi; số nhân viên khóa khi
  đã chốt loại tương ứng; không xóa ngày đã có lịch sử.
- ClassMealCount: khi đã chốt dự kiến không thêm/xóa lớp, không sửa suất dự kiến hay sĩ số snapshot;
  khi đã chốt thực tế không sửa suất thực tế.
- Lúc COMMIT: vừa chốt dự kiến thì mọi lớp đang hoạt động có dòng, mọi dòng và số nhân viên đã nhập
  (NULL ≠ 0); tương tự khi chốt thực tế. Mỗi lần đổi trạng thái chốt phải có một LunchDayEvent
  đúng action và version.
- LunchDayEvent chỉ thêm, không sửa/xóa.
"""

from django.db import migrations


FORWARD_SQL = """
CREATE FUNCTION sf43_lunch_day_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.planned_confirmed_at IS NOT NULL
           OR EXISTS (SELECT 1 FROM inventory_lunchdayevent WHERE lunch_day_id = OLD.id) THEN
            RAISE EXCEPTION 'Lunch day with history cannot be deleted'
                USING ERRCODE = '23514', CONSTRAINT = 'lunch_day_history_kept';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.version <> OLD.version + 1 THEN
        RAISE EXCEPTION 'Lunch day version must increase by exactly one'
            USING ERRCODE = '23514', CONSTRAINT = 'lunch_day_version';
    END IF;
    IF NEW.date <> OLD.date THEN
        RAISE EXCEPTION 'Lunch day date is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'lunch_day_date_immutable';
    END IF;
    IF OLD.planned_confirmed_at IS NOT NULL AND NEW.planned_confirmed_at IS NOT NULL
       AND NEW.staff_planned IS DISTINCT FROM OLD.staff_planned THEN
        RAISE EXCEPTION 'Planned counts are confirmed'
            USING ERRCODE = '23514', CONSTRAINT = 'planned_counts_locked';
    END IF;
    IF OLD.actual_confirmed_at IS NOT NULL AND NEW.actual_confirmed_at IS NOT NULL
       AND NEW.staff_actual IS DISTINCT FROM OLD.staff_actual THEN
        RAISE EXCEPTION 'Actual counts are confirmed'
            USING ERRCODE = '23514', CONSTRAINT = 'actual_counts_locked';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sf43_lunch_day_guard BEFORE UPDATE OR DELETE ON inventory_lunchday
FOR EACH ROW EXECUTE FUNCTION sf43_lunch_day_guard();

CREATE FUNCTION sf43_class_count_guard() RETURNS trigger AS $$
DECLARE day_row record; day_pk bigint;
BEGIN
    day_pk := CASE WHEN TG_OP = 'DELETE' THEN OLD.lunch_day_id ELSE NEW.lunch_day_id END;
    IF TG_OP = 'UPDATE' AND NEW.lunch_day_id <> OLD.lunch_day_id THEN
        RAISE EXCEPTION 'Meal count cannot move to another day'
            USING ERRCODE = '23514', CONSTRAINT = 'class_meal_count_day_immutable';
    END IF;
    SELECT planned_confirmed_at, actual_confirmed_at INTO day_row
    FROM inventory_lunchday WHERE id = day_pk FOR UPDATE;

    IF day_row.planned_confirmed_at IS NOT NULL THEN
        IF TG_OP <> 'UPDATE' OR NEW.school_class_id <> OLD.school_class_id
           OR NEW.enrolled_snapshot <> OLD.enrolled_snapshot
           OR NEW.planned IS DISTINCT FROM OLD.planned THEN
            RAISE EXCEPTION 'Planned counts are confirmed'
                USING ERRCODE = '23514', CONSTRAINT = 'planned_counts_locked';
        END IF;
    END IF;
    IF day_row.actual_confirmed_at IS NOT NULL AND TG_OP = 'UPDATE'
       AND NEW.actual IS DISTINCT FROM OLD.actual THEN
        RAISE EXCEPTION 'Actual counts are confirmed'
            USING ERRCODE = '23514', CONSTRAINT = 'actual_counts_locked';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sf43_class_count_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_classmealcount
FOR EACH ROW EXECUTE FUNCTION sf43_class_count_guard();

CREATE FUNCTION sf43_check_confirmation() RETURNS trigger AS $$
DECLARE newly_planned boolean; newly_actual boolean;
        reopened_planned boolean; reopened_actual boolean; expected_action varchar;
BEGIN
    newly_planned := NEW.planned_confirmed_at IS NOT NULL
        AND (TG_OP = 'INSERT' OR OLD.planned_confirmed_at IS NULL);
    newly_actual := NEW.actual_confirmed_at IS NOT NULL
        AND (TG_OP = 'INSERT' OR OLD.actual_confirmed_at IS NULL);
    reopened_planned := TG_OP = 'UPDATE' AND OLD.planned_confirmed_at IS NOT NULL AND NEW.planned_confirmed_at IS NULL;
    reopened_actual := TG_OP = 'UPDATE' AND OLD.actual_confirmed_at IS NOT NULL AND NEW.actual_confirmed_at IS NULL;

    IF newly_planned THEN
        IF NEW.staff_planned IS NULL
           OR EXISTS (SELECT 1 FROM inventory_classmealcount WHERE lunch_day_id = NEW.id AND planned IS NULL)
           OR EXISTS (SELECT 1 FROM inventory_schoolclass c WHERE c.is_active AND NOT EXISTS (
                SELECT 1 FROM inventory_classmealcount m WHERE m.lunch_day_id = NEW.id AND m.school_class_id = c.id))
        THEN
            RAISE EXCEPTION 'All active classes and staff need planned counts before confirming'
                USING ERRCODE = '23514', CONSTRAINT = 'planned_counts_complete';
        END IF;
    END IF;
    IF newly_actual THEN
        IF NEW.staff_actual IS NULL
           OR EXISTS (SELECT 1 FROM inventory_classmealcount WHERE lunch_day_id = NEW.id AND actual IS NULL)
        THEN
            RAISE EXCEPTION 'All classes and staff need actual counts before confirming'
                USING ERRCODE = '23514', CONSTRAINT = 'actual_counts_complete';
        END IF;
    END IF;

    expected_action := CASE
        WHEN newly_planned THEN 'confirm_planned'
        WHEN newly_actual THEN 'confirm_actual'
        WHEN reopened_actual THEN 'reopen_actual'
        WHEN reopened_planned THEN 'reopen_planned'
    END;
    IF expected_action IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM inventory_lunchdayevent
        WHERE lunch_day_id = NEW.id AND version = NEW.version AND action = expected_action
    ) THEN
        RAISE EXCEPTION 'Confirmation changes need a matching history event'
            USING ERRCODE = '23514', CONSTRAINT = 'lunch_day_event_required';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER sf43_lunch_day_confirmation
AFTER INSERT OR UPDATE ON inventory_lunchday DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sf43_check_confirmation();

CREATE FUNCTION sf43_event_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Lunch day history is append-only'
        USING ERRCODE = '23514', CONSTRAINT = 'lunch_day_event_read_only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sf43_event_append_only BEFORE UPDATE OR DELETE ON inventory_lunchdayevent
FOR EACH ROW EXECUTE FUNCTION sf43_event_append_only();
"""

REVERSE_SQL = """
DROP TRIGGER sf43_event_append_only ON inventory_lunchdayevent;
DROP TRIGGER sf43_lunch_day_confirmation ON inventory_lunchday;
DROP TRIGGER sf43_class_count_guard ON inventory_classmealcount;
DROP TRIGGER sf43_lunch_day_guard ON inventory_lunchday;
DROP FUNCTION sf43_event_append_only();
DROP FUNCTION sf43_check_confirmation();
DROP FUNCTION sf43_class_count_guard();
DROP FUNCTION sf43_lunch_day_guard();
"""


class Migration(migrations.Migration):
    dependencies = [("inventory", "0012_lunch_counts")]
    operations = [migrations.RunSQL(FORWARD_SQL, REVERSE_SQL)]
