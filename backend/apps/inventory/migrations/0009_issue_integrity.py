"""SF25: bất biến phiếu xuất giống SF19 (phiếu nhập), trên sổ kho chung.

- Deferred constraint trigger: tới COMMIT phiếu xuất phải có dòng; nháp không có bút toán;
  phiếu đã chốt có đúng một bút toán OUT khớp từng dòng (food, lượng âm, giá vốn, thành tiền, ngày).
- Phiếu xuất đã chốt và các dòng của nó chỉ đọc.
- Sổ kho chỉ thêm (append-only); không thêm bút toán vào chứng từ đã chốt, dù nguồn là
  phiếu nhập hay phiếu xuất. Trigger ledger cũ của SF19 được gom thành stock_ledger_guard().
"""

from django.db import migrations


FORWARD_SQL = """
-- 1) Trigger kiểm tra phiếu nhập lúc COMMIT chỉ chạy cho bút toán có nguồn phiếu nhập.
DROP TRIGGER sf19_ledger_complete ON inventory_stocktransaction;
CREATE CONSTRAINT TRIGGER sf19_ledger_complete
AFTER INSERT ON inventory_stocktransaction DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW.receipt_line_id IS NOT NULL)
EXECUTE FUNCTION sf19_validate_receipt_change();

-- 2) Guard chung cho sổ kho (thay sf19_protect_ledger).
DROP TRIGGER sf19_protect_stock_transaction ON inventory_stocktransaction;
DROP FUNCTION sf19_protect_ledger();

CREATE FUNCTION stock_ledger_guard() RETURNS trigger AS $$
DECLARE source_status varchar;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Stock ledger is append-only'
            USING ERRCODE = '23514', CONSTRAINT = 'stock_ledger_read_only';
    END IF;
    IF NEW.receipt_line_id IS NOT NULL THEN
        SELECT receipt.status INTO source_status FROM inventory_receipt receipt
        JOIN inventory_receiptline line ON line.receipt_id = receipt.id
        WHERE line.id = NEW.receipt_line_id FOR UPDATE OF receipt;
        IF source_status = 'posted' THEN
            RAISE EXCEPTION 'Cannot append ledger to a posted receipt'
                USING ERRCODE = '23514', CONSTRAINT = 'posted_receipt_read_only';
        END IF;
    END IF;
    IF NEW.issue_line_id IS NOT NULL THEN
        SELECT issue.status INTO source_status FROM inventory_issue issue
        JOIN inventory_issueline line ON line.issue_id = issue.id
        WHERE line.id = NEW.issue_line_id FOR UPDATE OF issue;
        IF source_status = 'posted' THEN
            RAISE EXCEPTION 'Cannot append ledger to a posted issue'
                USING ERRCODE = '23514', CONSTRAINT = 'posted_issue_read_only';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER stock_ledger_guard
BEFORE INSERT OR UPDATE OR DELETE ON inventory_stocktransaction
FOR EACH ROW EXECUTE FUNCTION stock_ledger_guard();

-- 3) Kiểm tra toàn phiếu xuất lúc COMMIT.
CREATE FUNCTION sf25_check_issue(issue_pk bigint) RETURNS void AS $$
DECLARE issue_status varchar;
BEGIN
    SELECT status INTO issue_status FROM inventory_issue WHERE id = issue_pk FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    IF NOT EXISTS (SELECT 1 FROM inventory_issueline WHERE issue_id = issue_pk) THEN
        RAISE EXCEPTION 'Issue must contain at least one line'
            USING ERRCODE = '23514', CONSTRAINT = 'issue_requires_lines';
    END IF;

    IF issue_status = 'draft' AND EXISTS (
        SELECT 1 FROM inventory_stocktransaction st
        JOIN inventory_issueline line ON line.id = st.issue_line_id
        WHERE line.issue_id = issue_pk
    ) THEN
        RAISE EXCEPTION 'Draft issue must not have stock transactions'
            USING ERRCODE = '23514', CONSTRAINT = 'draft_issue_has_no_ledger';
    END IF;

    IF issue_status = 'posted' AND EXISTS (
        SELECT 1 FROM inventory_issueline line
        JOIN inventory_issue issue ON issue.id = line.issue_id
        LEFT JOIN inventory_stocktransaction st ON st.issue_line_id = line.id
        WHERE line.issue_id = issue_pk AND (
            st.id IS NULL OR st.type <> 'OUT' OR st.food_id <> line.food_id
            OR st.quantity_delta <> -line.quantity OR st.unit_cost <> line.unit_cost
            OR st.value_delta <> -round(line.quantity * line.unit_cost, 2)
            OR st.date <> issue.date
        )
    ) THEN
        RAISE EXCEPTION 'Posted issue needs one matching OUT transaction per line'
            USING ERRCODE = '23514', CONSTRAINT = 'posted_issue_ledger_matches';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION sf25_validate_issue_change() RETURNS trigger AS $$
DECLARE issue_pk bigint;
BEGIN
    IF TG_TABLE_NAME = 'inventory_issue' THEN
        PERFORM sf25_check_issue(NEW.id);
    ELSIF TG_TABLE_NAME = 'inventory_issueline' THEN
        IF TG_OP <> 'INSERT' THEN PERFORM sf25_check_issue(OLD.issue_id); END IF;
        IF TG_OP <> 'DELETE' THEN PERFORM sf25_check_issue(NEW.issue_id); END IF;
    ELSE
        SELECT issue_id INTO issue_pk FROM inventory_issueline WHERE id = NEW.issue_line_id;
        PERFORM sf25_check_issue(issue_pk);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER sf25_issue_complete
AFTER INSERT OR UPDATE ON inventory_issue DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sf25_validate_issue_change();
CREATE CONSTRAINT TRIGGER sf25_issue_lines_complete
AFTER INSERT OR UPDATE OR DELETE ON inventory_issueline DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sf25_validate_issue_change();
CREATE CONSTRAINT TRIGGER sf25_issue_ledger_complete
AFTER INSERT ON inventory_stocktransaction DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW.issue_line_id IS NOT NULL)
EXECUTE FUNCTION sf25_validate_issue_change();

-- 4) Phiếu xuất đã chốt chỉ đọc.
CREATE FUNCTION sf25_protect_posted_issue() RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'posted' THEN
        RAISE EXCEPTION 'Posted issue is read-only'
            USING ERRCODE = '23514', CONSTRAINT = 'posted_issue_read_only';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sf25_protect_issue BEFORE UPDATE OR DELETE ON inventory_issue
FOR EACH ROW EXECUTE FUNCTION sf25_protect_posted_issue();

CREATE FUNCTION sf25_protect_issue_line() RETURNS trigger AS $$
DECLARE old_issue bigint; new_issue bigint; locked_issue record;
BEGIN
    IF TG_OP <> 'INSERT' THEN old_issue := OLD.issue_id; END IF;
    IF TG_OP <> 'DELETE' THEN new_issue := NEW.issue_id; END IF;
    FOR locked_issue IN
        SELECT id, status FROM inventory_issue
        WHERE id IN (old_issue, new_issue) ORDER BY id FOR UPDATE
    LOOP
        IF locked_issue.status = 'posted' THEN
            RAISE EXCEPTION 'Lines of posted issue are read-only'
                USING ERRCODE = '23514', CONSTRAINT = 'posted_issue_lines_read_only';
        END IF;
    END LOOP;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sf25_protect_line BEFORE INSERT OR UPDATE OR DELETE ON inventory_issueline
FOR EACH ROW EXECUTE FUNCTION sf25_protect_issue_line();
"""

REVERSE_SQL = """
DROP TRIGGER sf25_protect_line ON inventory_issueline;
DROP TRIGGER sf25_protect_issue ON inventory_issue;
DROP TRIGGER sf25_issue_ledger_complete ON inventory_stocktransaction;
DROP TRIGGER sf25_issue_lines_complete ON inventory_issueline;
DROP TRIGGER sf25_issue_complete ON inventory_issue;
DROP FUNCTION sf25_protect_issue_line();
DROP FUNCTION sf25_protect_posted_issue();
DROP FUNCTION sf25_validate_issue_change();
DROP FUNCTION sf25_check_issue(bigint);

DROP TRIGGER stock_ledger_guard ON inventory_stocktransaction;
DROP FUNCTION stock_ledger_guard();
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

DROP TRIGGER sf19_ledger_complete ON inventory_stocktransaction;
CREATE CONSTRAINT TRIGGER sf19_ledger_complete
AFTER INSERT ON inventory_stocktransaction DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sf19_validate_receipt_change();
"""


class Migration(migrations.Migration):
    dependencies = [("inventory", "0008_issue_contract")]
    operations = [migrations.RunSQL(FORWARD_SQL, REVERSE_SQL)]
