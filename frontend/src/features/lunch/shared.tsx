/** Phần dùng chung cho các màn bữa trưa G2: chọn ngày ăn (?ngay=), nhãn trạng thái. */
import { IconCalendar, IconChevronLeft, IconChevronRight } from '../../components/icons';
import { Badge, Button, IconButton, TextField, Toolbar } from '../../components/ui';
import { todayISO } from '../../lib/format';
import { PO_STATUS, type PoStatus } from '../../services/lunch';
import { shiftDate } from '../../services/menus';
import { useQueryParam } from '../inventory/shared';
import s from '../inventory/shared.module.css';

/** Ngày ăn đang xem: ?ngay=YYYY-MM-DD, mặc định hôm nay (giờ Việt Nam). */
export function useLunchDate(): [string, (d: string) => void] {
  const today = todayISO();
  const [date, setDate] = useQueryParam('ngay', today);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  return [valid, (d: string) => setDate(d || today)];
}

export function DayPicker({ date, onChange, label = 'Ngày ăn' }: { date: string; onChange: (d: string) => void; label?: string }) {
  const today = todayISO();
  return (
    <Toolbar>
      <span className={s.inlineGroup}>
        <IconButton label="Ngày trước" onClick={() => onChange(shiftDate(date, -1))}>
          <IconChevronLeft size={18} />
        </IconButton>
        <TextField label={label} type="date" value={date} onChange={(e) => onChange(e.target.value)} />
        <IconButton label="Ngày sau" onClick={() => onChange(shiftDate(date, 1))}>
          <IconChevronRight size={18} />
        </IconButton>
      </span>
      {date !== today ? (
        <Button variant="ghost" icon={<IconCalendar size={18} />} onClick={() => onChange(today)}>
          Về hôm nay
        </Button>
      ) : null}
    </Toolbar>
  );
}

export function PoStatusBadge({ status }: { status: PoStatus }) {
  const meta = PO_STATUS[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** "0.000" → true. Dùng cho chuỗi Decimal từ API (không đổi sang số thực để tính). */
export function isZero(value: string | null | undefined): boolean {
  return !value || /^-?0*(\.0*)?$/.test(value);
}
