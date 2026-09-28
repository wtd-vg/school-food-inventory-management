"""PostgreSQL: kiểm tra cả phiếu lúc COMMIT và bảo vệ dữ liệu đã chốt.

CHECK thông thường không thể đếm dòng ở bảng khác. Constraint trigger deferred
cho phép tạo đầu phiếu rồi các dòng trong cùng transaction, nhưng cấm commit
phiếu rỗng. Khóa đầu phiếu khi sửa dòng để hai request không cùng xóa dòng cuối.
"""

from django.db import migrations


FORWARD_SQL = """
CREATE FUNCTION sf19_check_receipt(receipt_pk bigint) RETURNS void AS $$
DECLARE receipt_status varchar;
BEGIN
    SELECT status INTO receipt_status FROM inventory_receipt
    WHERE id = receipt_pk FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    IF NOT EXISTS (SELECT 1 FROM inventory_receiptline WHERE receipt_id = receipt_pk) THEN
        RAISE EXCEPTION 'Receipt must contain at least one line'
            USING ERRCODE = '23514', CONSTRAINT = 'receipt_requires_lines';
    END IF;

    IF receipt_status = 'draft' AND EXISTS (
        SELECT 1 FROM inventory_stocktransaction st
        JOIN inventory_receiptline line ON line.id = st.receipt_line_id
        WHERE line.receipt_id = receipt_pk
    ) THEN
        RAISE EXCEPTION 'Draft receipt must not have stock transactions'
            USING ERRCODE = '23514', CONSTRAINT = 'draft_has_no_ledger';
    END IF;

    IF receipt_status = 'posted' AND EXISTS (
        SELECT 1 FROM inventory_receiptline line
        JOIN inventory_receipt receipt ON receipt.id = line.receipt_id
        LEFT JOIN inventory_stocktransaction st ON st.receipt_line_id = line.id
        WHERE line.receipt_id = receipt_pk AND (
            st.id IS NULL OR st.food_id <> line.food_id
            OR st.quantity_delta <> line.quantity OR st.unit_cost <> line.unit_price
            OR st.value_delta <> round(line.quantity * line.unit_price, 2)
            OR st.date <> receipt.date
        )
    ) THEN
        RAISE EXCEPTION 'Posted receipt needs one matching stock transaction per line'
            USING ERRCODE = '23514', CONSTRAINT = 'posted_receipt_ledger_matches';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION sf19_validate_receipt_change() RETURNS trigger AS $$
DECLARE receipt_pk bigint;
BEGIN
    IF TG_TABLE_NAME = 'inventory_receipt' THEN
        PERFORM sf19_check_receipt(NEW.id);
    ELSIF TG_TABLE_NAME = 'inventory_receiptline' THEN
        IF TG_OP <> 'INSERT' THEN PERFORM sf19_check_receipt(OLD.receipt_id); END IF;
        IF TG_OP <> 'DELETE' THEN PERFORM sf19_check_receipt(NEW.receipt_id); END IF;
    ELSE
        SELECT receipt_id INTO receipt_pk FROM inventory_receiptline WHERE id = NEW.receipt_line_id;
        PERFORM sf19_check_receipt(receipt_pk);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER sf19_receipt_complete
AFTER INSERT OR UPDATE ON inventory_receipt DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sf19_validate_receipt_change();
CREATE CONSTRAINT TRIGGER sf19_lines_complete
AFTER INSERT OR UPDATE OR DELETE ON inventory_receiptline DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sf19_validate_receipt_change();
CREATE CONSTRAINT TRIGGER sf19_ledger_complete
AFTER INSERT ON inventory_stocktransaction DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sf19_validate_receipt_change();

CREATE FUNCTION sf19_protect_posted_receipt() RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'posted' THEN
        RAISE EXCEPTION 'Posted receipt is read-only'
            USING ERRCODE = '23514', CONSTRAINT = 'posted_receipt_read_only';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sf19_protect_receipt BEFORE UPDATE OR DELETE ON inventory_receipt
FOR EACH ROW EXECUTE FUNCTION sf19_protect_posted_receipt();

CREATE FUNCTION sf19_protect_receipt_line() RETURNS trigger AS $$
DECLARE old_receipt bigint; new_receipt bigint; locked_receipt record;
BEGIN
    IF TG_OP <> 'INSERT' THEN old_receipt := OLD.receipt_id; END IF;
    IF TG_OP <> 'DELETE' THEN new_receipt := NEW.receipt_id; END IF;
    FOR locked_receipt IN
        SELECT id, status FROM inventory_receipt
        WHERE id IN (old_receipt, new_receipt) ORDER BY id FOR UPDATE
    LOOP
        IF locked_receipt.status = 'posted' THEN
            RAISE EXCEPTION 'Lines of posted receipt are read-only'
                USING ERRCODE = '23514', CONSTRAINT = 'posted_receipt_lines_read_only';
        END IF;
    END LOOP;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sf19_protect_line BEFORE INSERT OR UPDATE OR DELETE ON inventory_receiptline
FOR EACH ROW EXECUTE FUNCTION sf19_protect_receipt_line();

CREATE FUNCTION sf19_protect_ledger() RETURNS trigger AS $$
DECLARE receipt_status varchar;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Stock ledger is append-only'
            USING ERRCODE = '23514', CONSTRAINT = 'stock_ledger_read_only';
    END IF;
    SELECT receipt.status INTO receipt_status FROM inventory_receipt receipt
    JOIN inventory_receiptline line ON line.receipt_id = receipt.id
    WHERE line.id = NEW.receipt_line_id FOR UPDATE OF receipt;
    IF receipt_status = 'posted' THEN
        RAISE EXCEPTION 'Cannot append ledger to a posted receipt'
            USING ERRCODE = '23514', CONSTRAINT = 'posted_receipt_read_only';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sf19_protect_stock_transaction
BEFORE INSERT OR UPDATE OR DELETE ON inventory_stocktransaction
FOR EACH ROW EXECUTE FUNCTION sf19_protect_ledger();
"""

REVERSE_SQL = """
DROP TRIGGER sf19_protect_stock_transaction ON inventory_stocktransaction;
DROP TRIGGER sf19_protect_line ON inventory_receiptline;
DROP TRIGGER sf19_protect_receipt ON inventory_receipt;
DROP TRIGGER sf19_ledger_complete ON inventory_stocktransaction;
DROP TRIGGER sf19_lines_complete ON inventory_receiptline;
DROP TRIGGER sf19_receipt_complete ON inventory_receipt;
DROP FUNCTION sf19_protect_ledger();
DROP FUNCTION sf19_protect_receipt_line();
DROP FUNCTION sf19_protect_posted_receipt();
DROP FUNCTION sf19_validate_receipt_change();
DROP FUNCTION sf19_check_receipt(bigint);
"""


class Migration(migrations.Migration):
    dependencies = [("inventory", "0005_receipt_ledger")]
    operations = [migrations.RunSQL(FORWARD_SQL, REVERSE_SQL)]
