"""BE-04: mỗi học sinh tối đa 2 email phụ huynh (service kiểm trước; trigger là lớp bảo vệ ở DB)."""

from django.db import migrations

FORWARD_SQL = """
CREATE FUNCTION be04_parent_contact_limit() RETURNS trigger AS $$
BEGIN
    PERFORM 1 FROM inventory_student WHERE id = NEW.student_id FOR UPDATE;
    IF (SELECT count(*) FROM inventory_parentcontact WHERE student_id = NEW.student_id) >= 2 THEN
        RAISE EXCEPTION 'A student has at most two parent emails'
            USING ERRCODE = '23514', CONSTRAINT = 'parent_contact_limit';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER be04_parent_contact_limit BEFORE INSERT ON inventory_parentcontact
FOR EACH ROW EXECUTE FUNCTION be04_parent_contact_limit();
"""

REVERSE_SQL = """
DROP TRIGGER be04_parent_contact_limit ON inventory_parentcontact;
DROP FUNCTION be04_parent_contact_limit();
"""


class Migration(migrations.Migration):
    dependencies = [("inventory", "0017_students_email")]
    operations = [migrations.RunSQL(FORWARD_SQL, REVERSE_SQL)]
