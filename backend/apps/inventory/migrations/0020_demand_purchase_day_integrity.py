"""Đợt 2 (SF55/61/67): bất biến ở PostgreSQL.

- DemandRevision: draft → approved/stale, approved → stale; stale là cuối. Không xóa bản đã duyệt/lỗi thời.
- DemandLine: chỉ thêm/sửa khi bản tính còn draft.
- PurchaseOrderLine: qty_received chỉ tăng; food/đơn không đổi; đơn đã đóng/hủy không sửa dòng.
- ReceiptLine.po_line: cùng mặt hàng với dòng đơn.
- StockAllocation: không xóa; consumed/released là cuối; khi reserved chỉ được giảm qty (tách dòng).
- Issue: không tạo/sửa phiếu xuất cho ngày ăn đã đóng.
- LunchDayClose: không xóa; chỉ được ghi mở lại một lần.
"""

from django.db import migrations

FORWARD_SQL = """
CREATE FUNCTION g2_demand_revision_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Approved or stale demand revision is history'
                USING ERRCODE = '23514', CONSTRAINT = 'demand_revision_history_kept';
        END IF;
        RETURN OLD;
    END IF;
    IF NEW.lunch_day_id <> OLD.lunch_day_id OR NEW.revision <> OLD.revision OR NEW.servings <> OLD.servings THEN
        RAISE EXCEPTION 'Demand revision identity is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'demand_revision_immutable';
    END IF;
    IF OLD.status = 'stale' AND NEW.status <> 'stale'
       OR OLD.status = 'approved' AND NEW.status NOT IN ('approved', 'stale') THEN
        RAISE EXCEPTION 'Invalid demand revision status change % -> %', OLD.status, NEW.status
            USING ERRCODE = '23514', CONSTRAINT = 'demand_revision_status_flow';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER g2_demand_revision_guard BEFORE UPDATE OR DELETE ON inventory_demandrevision
FOR EACH ROW EXECUTE FUNCTION g2_demand_revision_guard();

CREATE FUNCTION g2_demand_line_guard() RETURNS trigger AS $$
DECLARE st text;
BEGIN
    SELECT status INTO st FROM inventory_demandrevision
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.revision_id ELSE NEW.revision_id END;
    IF st IS NOT NULL AND st <> 'draft' THEN
        RAISE EXCEPTION 'Demand lines are locked once the revision is approved or stale'
            USING ERRCODE = '23514', CONSTRAINT = 'demand_line_locked';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER g2_demand_line_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_demandline
FOR EACH ROW EXECUTE FUNCTION g2_demand_line_guard();

CREATE FUNCTION g2_po_line_guard() RETURNS trigger AS $$
DECLARE st text;
BEGIN
    SELECT status INTO st FROM inventory_purchaseorder
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
    IF TG_OP = 'DELETE' THEN
        IF OLD.qty_received > 0 THEN
            RAISE EXCEPTION 'Received order line cannot be deleted'
                USING ERRCODE = '23514', CONSTRAINT = 'po_line_received_kept';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.order_id <> OLD.order_id OR NEW.food_id <> OLD.food_id THEN
            RAISE EXCEPTION 'Order line identity is immutable'
                USING ERRCODE = '23514', CONSTRAINT = 'po_line_immutable';
        END IF;
        IF NEW.qty_received < OLD.qty_received THEN
            RAISE EXCEPTION 'Received quantity cannot decrease'
                USING ERRCODE = '23514', CONSTRAINT = 'po_line_received_monotonic';
        END IF;
        IF st IN ('closed', 'cancelled') AND (NEW.qty_received <> OLD.qty_received OR NEW.qty_ordered <> OLD.qty_ordered) THEN
            RAISE EXCEPTION 'Closed or cancelled order is read-only'
                USING ERRCODE = '23514', CONSTRAINT = 'po_closed_readonly';
        END IF;
        IF st IN ('sent') AND NEW.qty_ordered <> OLD.qty_ordered THEN
            RAISE EXCEPTION 'Ordered quantity is fixed once sent to supplier'
                USING ERRCODE = '23514', CONSTRAINT = 'po_sent_quantity_fixed';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER g2_po_line_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_purchaseorderline
FOR EACH ROW EXECUTE FUNCTION g2_po_line_guard();

CREATE FUNCTION g2_receipt_line_po_food() RETURNS trigger AS $$
BEGIN
    IF NEW.po_line_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM inventory_purchaseorderline WHERE id = NEW.po_line_id AND food_id = NEW.food_id
    ) THEN
        RAISE EXCEPTION 'Receipt line food must match its order line'
            USING ERRCODE = '23514', CONSTRAINT = 'receipt_line_po_food_match';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER g2_receipt_line_po_food BEFORE INSERT OR UPDATE ON inventory_receiptline
FOR EACH ROW EXECUTE FUNCTION g2_receipt_line_po_food();

CREATE FUNCTION g2_allocation_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Allocations are history; release instead of delete'
            USING ERRCODE = '23514', CONSTRAINT = 'allocation_history_kept';
    END IF;
    IF OLD.status <> 'reserved' THEN
        RAISE EXCEPTION 'Consumed or released allocation is final'
            USING ERRCODE = '23514', CONSTRAINT = 'allocation_final';
    END IF;
    IF NEW.lunch_day_id <> OLD.lunch_day_id OR NEW.food_id <> OLD.food_id OR NEW.demand_line_id <> OLD.demand_line_id THEN
        RAISE EXCEPTION 'Allocation identity is immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'allocation_immutable';
    END IF;
    IF NEW.status = 'reserved' AND NEW.qty > OLD.qty THEN
        RAISE EXCEPTION 'Reserved allocation can only shrink (split into a new row)'
            USING ERRCODE = '23514', CONSTRAINT = 'allocation_no_growth';
    END IF;
    IF NEW.status <> 'reserved' AND (NEW.qty <> OLD.qty OR NEW.source <> OLD.source) THEN
        RAISE EXCEPTION 'Change quantity or source before finishing an allocation'
            USING ERRCODE = '23514', CONSTRAINT = 'allocation_finish_unchanged';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER g2_allocation_guard BEFORE UPDATE OR DELETE ON inventory_stockallocation
FOR EACH ROW EXECUTE FUNCTION g2_allocation_guard();

CREATE FUNCTION g2_issue_closed_day() RETURNS trigger AS $$
BEGIN
    IF NEW.lunch_day_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM inventory_lunchdayclose WHERE lunch_day_id = NEW.lunch_day_id AND reopened_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Lunch day is closed'
            USING ERRCODE = '23514', CONSTRAINT = 'lunch_day_closed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER g2_issue_closed_day BEFORE INSERT OR UPDATE ON inventory_issue
FOR EACH ROW EXECUTE FUNCTION g2_issue_closed_day();

CREATE FUNCTION g2_lunch_day_close_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Lunch day close is history'
            USING ERRCODE = '23514', CONSTRAINT = 'lunch_day_close_history_kept';
    END IF;
    IF OLD.reopened_at IS NOT NULL OR NEW.lunch_day_id <> OLD.lunch_day_id OR NEW.closed_by_id <> OLD.closed_by_id
       OR NEW.closed_at <> OLD.closed_at OR NEW.note <> OLD.note OR NEW.summary <> OLD.summary THEN
        RAISE EXCEPTION 'Lunch day close can only be reopened once'
            USING ERRCODE = '23514', CONSTRAINT = 'lunch_day_close_immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER g2_lunch_day_close_guard BEFORE UPDATE OR DELETE ON inventory_lunchdayclose
FOR EACH ROW EXECUTE FUNCTION g2_lunch_day_close_guard();
"""

REVERSE_SQL = """
DROP TRIGGER g2_lunch_day_close_guard ON inventory_lunchdayclose;
DROP TRIGGER g2_issue_closed_day ON inventory_issue;
DROP TRIGGER g2_allocation_guard ON inventory_stockallocation;
DROP TRIGGER g2_receipt_line_po_food ON inventory_receiptline;
DROP TRIGGER g2_po_line_guard ON inventory_purchaseorderline;
DROP TRIGGER g2_demand_line_guard ON inventory_demandline;
DROP TRIGGER g2_demand_revision_guard ON inventory_demandrevision;
DROP FUNCTION g2_lunch_day_close_guard();
DROP FUNCTION g2_issue_closed_day();
DROP FUNCTION g2_allocation_guard();
DROP FUNCTION g2_receipt_line_po_food();
DROP FUNCTION g2_po_line_guard();
DROP FUNCTION g2_demand_line_guard();
DROP FUNCTION g2_demand_revision_guard();
"""


class Migration(migrations.Migration):
    dependencies = [("inventory", "0019_demand_purchase_day")]
    operations = [migrations.RunSQL(FORWARD_SQL, REVERSE_SQL)]
