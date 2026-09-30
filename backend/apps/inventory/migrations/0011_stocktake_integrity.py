"""SF31: bất biến kiểm kê trên sổ kho chung (cùng khuôn SF19/SF25).

- Lúc COMMIT: phiếu kiểm kê phải có dòng; nháp không có bút toán; phiếu đã chốt thì mọi dòng
  đã đếm, dòng chênh lệch khác 0 có đúng một bút toán ADJUST khớp (lượng = variance, giá = giá
  snapshot, thành tiền, ngày kiểm kê), dòng chênh lệch 0 không có bút toán.
- Phiếu kiểm kê đã chốt và các dòng chỉ đọc.
- stock_ledger_guard: thêm nguồn stocktake_item.
"""

from django.db import migrations


FORWARD_SQL = """
CREATE OR REPLACE FUNCTION stock_ledger_guard() RETURNS trigger AS $$
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
    IF NEW.stocktake_item_id IS NOT NULL THEN
        SELECT st.status INTO source_status FROM inventory_stocktake st
        JOIN inventory_stocktakeitem item ON item.stock_take_id = st.id
        WHERE item.id = NEW.stocktake_item_id FOR UPDATE OF st;
        IF source_status = 'posted' THEN
            RAISE EXCEPTION 'Cannot append ledger to a posted stocktake'
                USING ERRCODE = '23514', CONSTRAINT = 'posted_stocktake_read_only';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION sf31_check_stocktake(stocktake_pk bigint) RETURNS void AS $$
DECLARE stocktake_status varchar;
BEGIN
    SELECT status INTO stocktake_status FROM inventory_stocktake WHERE id = stocktake_pk FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    IF NOT EXISTS (SELECT 1 FROM inventory_stocktakeitem WHERE stock_take_id = stocktake_pk) THEN
        RAISE EXCEPTION 'Stocktake must contain at least one item'
            USING ERRCODE = '23514', CONSTRAINT = 'stocktake_requires_items';
    END IF;

    IF stocktake_status = 'draft' AND EXISTS (
        SELECT 1 FROM inventory_stocktransaction tx
        JOIN inventory_stocktakeitem item ON item.id = tx.stocktake_item_id
        WHERE item.stock_take_id = stocktake_pk
    ) THEN
        RAISE EXCEPTION 'Draft stocktake must not have stock transactions'
            USING ERRCODE = '23514', CONSTRAINT = 'draft_stocktake_has_no_ledger';
    END IF;

    IF stocktake_status = 'posted' AND EXISTS (
        SELECT 1 FROM inventory_stocktakeitem item
        JOIN inventory_stocktake st ON st.id = item.stock_take_id
        LEFT JOIN inventory_stocktransaction tx ON tx.stocktake_item_id = item.id
        WHERE item.stock_take_id = stocktake_pk AND (
            item.counted_qty IS NULL
            OR (item.variance = 0 AND tx.id IS NOT NULL)
            OR (item.variance <> 0 AND (
                tx.id IS NULL OR tx.type <> 'ADJUST' OR tx.food_id <> item.food_id
                OR tx.quantity_delta <> item.variance OR tx.unit_cost <> item.snapshot_cost
                OR tx.value_delta <> round(item.variance * item.snapshot_cost, 2)
                OR tx.date IS DISTINCT FROM st.date
            ))
        )
    ) THEN
        RAISE EXCEPTION 'Posted stocktake needs counted items and one matching ADJUST per variance'
            USING ERRCODE = '23514', CONSTRAINT = 'posted_stocktake_ledger_matches';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION sf31_validate_stocktake_change() RETURNS trigger AS $$
DECLARE stocktake_pk bigint;
BEGIN
    IF TG_TABLE_NAME = 'inventory_stocktake' THEN
        PERFORM sf31_check_stocktake(NEW.id);
    ELSIF TG_TABLE_NAME = 'inventory_stocktakeitem' THEN
        IF TG_OP <> 'INSERT' THEN PERFORM sf31_check_stocktake(OLD.stock_take_id); END IF;
        IF TG_OP <> 'DELETE' THEN PERFORM sf31_check_stocktake(NEW.stock_take_id); END IF;
    ELSE
        SELECT stock_take_id INTO stocktake_pk FROM inventory_stocktakeitem WHERE id = NEW.stocktake_item_id;
        PERFORM sf31_check_stocktake(stocktake_pk);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER sf31_stocktake_complete
AFTER INSERT OR UPDATE ON inventory_stocktake DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sf31_validate_stocktake_change();
CREATE CONSTRAINT TRIGGER sf31_stocktake_items_complete
AFTER INSERT OR UPDATE OR DELETE ON inventory_stocktakeitem DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sf31_validate_stocktake_change();
CREATE CONSTRAINT TRIGGER sf31_stocktake_ledger_complete
AFTER INSERT ON inventory_stocktransaction DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW.stocktake_item_id IS NOT NULL)
EXECUTE FUNCTION sf31_validate_stocktake_change();

CREATE FUNCTION sf31_protect_posted_stocktake() RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'posted' THEN
        RAISE EXCEPTION 'Posted stocktake is read-only'
            USING ERRCODE = '23514', CONSTRAINT = 'posted_stocktake_read_only';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sf31_protect_stocktake BEFORE UPDATE OR DELETE ON inventory_stocktake
FOR EACH ROW EXECUTE FUNCTION sf31_protect_posted_stocktake();

CREATE FUNCTION sf31_protect_stocktake_item() RETURNS trigger AS $$
DECLARE old_st bigint; new_st bigint; locked_st record;
BEGIN
    IF TG_OP <> 'INSERT' THEN old_st := OLD.stock_take_id; END IF;
    IF TG_OP <> 'DELETE' THEN new_st := NEW.stock_take_id; END IF;
    FOR locked_st IN
        SELECT id, status FROM inventory_stocktake
        WHERE id IN (old_st, new_st) ORDER BY id FOR UPDATE
    LOOP
        IF locked_st.status = 'posted' THEN
            RAISE EXCEPTION 'Items of posted stocktake are read-only'
                USING ERRCODE = '23514', CONSTRAINT = 'posted_stocktake_items_read_only';
        END IF;
    END LOOP;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sf31_protect_item BEFORE INSERT OR UPDATE OR DELETE ON inventory_stocktakeitem
FOR EACH ROW EXECUTE FUNCTION sf31_protect_stocktake_item();
"""

REVERSE_SQL = """
DROP TRIGGER sf31_protect_item ON inventory_stocktakeitem;
DROP TRIGGER sf31_protect_stocktake ON inventory_stocktake;
DROP TRIGGER sf31_stocktake_ledger_complete ON inventory_stocktransaction;
DROP TRIGGER sf31_stocktake_items_complete ON inventory_stocktakeitem;
DROP TRIGGER sf31_stocktake_complete ON inventory_stocktake;
DROP FUNCTION sf31_protect_stocktake_item();
DROP FUNCTION sf31_protect_posted_stocktake();
DROP FUNCTION sf31_validate_stocktake_change();
DROP FUNCTION sf31_check_stocktake(bigint);

CREATE OR REPLACE FUNCTION stock_ledger_guard() RETURNS trigger AS $$
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
"""


class Migration(migrations.Migration):
    dependencies = [("inventory", "0010_stocktake_contract")]
    operations = [migrations.RunSQL(FORWARD_SQL, REVERSE_SQL)]
