/**
 * SF69/SF78: ghép trạng thái thật của các API (số suất, thực đơn, nhu cầu, đơn đặt, phiếu xuất, chi phí) thành 7 bước
 * của một ngày ăn. Hàm thuần, không gọi API (tách khỏi TodayPage ở SF78, logic giữ nguyên).
 */
import type { ReactNode } from 'react';
import { formatDateTime, formatNumber, formatQty } from '../../lib/format';
import type { Issue } from '../../services/inventory';
import type { DayCost, DayDemand, PurchaseOrder } from '../../services/lunch';
import type { MealDay } from '../../services/meals';
import type { MenuDay } from '../../services/menus';
import { isZero } from './shared';

export type StepState = 'done' | 'doing' | 'todo' | 'warn' | 'skip';
export type Step = { key: string; title: string; state: StepState; detail: ReactNode; link?: { to: string; label: string } };

export const STATE_BADGE: Record<StepState, { label: string; tone: 'ok' | 'info' | 'neutral' | 'warn' }> = {
  done: { label: 'Xong', tone: 'ok' },
  doing: { label: 'Đang làm', tone: 'info' },
  todo: { label: 'Chưa làm', tone: 'neutral' },
  warn: { label: 'Cần xem lại', tone: 'warn' },
  skip: { label: 'Không cần', tone: 'neutral' },
};

/** Ghép trạng thái thật của các API thành 7 bước. Ngày nghỉ: chỉ bước Thực đơn có nghĩa. */
export function buildSteps(
  date: string,
  meal: MealDay | undefined,
  menu: MenuDay | undefined,
  demand: DayDemand | undefined,
  orders: PurchaseOrder[],
  issues: Issue[],
  cost: DayCost | null,
): Step[] {
  const q = `?ngay=${date}`;
  const steps: Step[] = [];

  // 1. Số suất
  if (!meal || meal.status === 'not_open') {
    steps.push({ key: 'suat', title: 'Số suất', state: 'todo', detail: 'Ngày chưa mở.', link: { to: `/lop-hoc/so-suat${q}`, label: 'Mở ngày, nhập số suất' } });
  } else {
    const planned = meal.planned_confirmed_at ? `Dự kiến ${formatNumber(meal.planned_total, 0)} suất (đã chốt)` : 'Dự kiến chưa chốt';
    const actual = meal.actual_confirmed_at ? `thực tế ${formatNumber(meal.actual_total, 0)} suất (đã chốt)` : 'thực tế chưa chốt';
    steps.push({
      key: 'suat',
      title: 'Số suất',
      state: meal.actual_confirmed_at ? 'done' : meal.planned_confirmed_at ? 'doing' : 'todo',
      detail: `${planned}; ${actual}.`,
      link: { to: `/lop-hoc/so-suat${q}`, label: 'Số suất' },
    });
  }

  // 2. Thực đơn
  if (menu && menu.status !== 'menu') {
    steps.push({ key: 'menu', title: 'Thực đơn', state: 'skip', detail: menu.status === 'holiday' ? `Ngày nghỉ: ${menu.holiday_name ?? 'ngày lễ'}.` : 'Nghỉ cuối tuần.' });
  } else {
    steps.push({
      key: 'menu',
      title: 'Thực đơn',
      state: menu?.dishes.length ? 'done' : 'todo',
      detail: menu?.dishes.length ? menu.dishes.map((d) => d.dish_name).join(', ') : 'Chưa có thực đơn cho ngày này.',
      link: { to: `/mon-an/thuc-don?tuan=${date}`, label: 'Thực đơn tuần' },
    });
  }

  // 3. Nhu cầu
  const current = demand?.current ?? null;
  const approved = current?.status === 'approved' ? current : null;
  steps.push({
    key: 'nhu-cau',
    title: 'Nhu cầu & đề xuất',
    state: demand?.is_outdated ? 'warn' : approved ? 'done' : current ? 'doing' : 'todo',
    detail: demand?.is_outdated
      ? 'Số suất hoặc thực đơn đã đổi sau khi tính: tính lại.'
      : approved
        ? `Đã duyệt bản ${approved.revision} (${formatNumber(approved.servings, 0)} suất).`
        : current
          ? `Bản tính ${current.revision} chưa duyệt.`
          : 'Chưa tính nhu cầu.',
    link: { to: `/bua-trua/nhu-cau${q}`, label: 'Nhu cầu & đề xuất' },
  });

  // 4. Đơn đặt & 5. Nhận hàng
  const needBuy = approved ? approved.lines.some((l) => !isZero(l.to_buy_qty)) : false;
  const live = orders.filter((o) => o.status !== 'cancelled');
  if (approved && !needBuy && !live.length) {
    steps.push({ key: 'don', title: 'Đơn đặt', state: 'skip', detail: 'Tồn và hàng chờ về đã đủ, không cần mua.' });
    steps.push({ key: 'nhan', title: 'Nhận hàng', state: 'skip', detail: 'Không có đơn cho ngày này.' });
  } else {
    const sentOrDone = live.length > 0 && live.every((o) => o.status === 'sent' || o.status === 'closed');
    steps.push({
      key: 'don',
      title: 'Đơn đặt',
      state: !live.length ? 'todo' : sentOrDone ? 'done' : 'doing',
      detail: live.length ? live.map((o) => `${o.code} (${o.supplier_name})`).join(', ') : needBuy ? 'Cần tạo đơn cho phần phải mua.' : 'Chưa có đề xuất đã duyệt.',
      link: { to: live.length === 1 ? `/bua-trua/don-dat?don=${live[0].id}` : '/bua-trua/don-dat', label: 'Đơn đặt' },
    });
    const allIn = live.length > 0 && live.every((o) => o.status === 'closed');
    const open = live.flatMap((o) => o.lines.filter((l) => !isZero(l.qty_open)).map((l) => `${l.food_name} còn ${formatQty(l.qty_open, l.unit)}`));
    steps.push({
      key: 'nhan',
      title: 'Nhận hàng',
      state: allIn ? 'done' : live.some((o) => o.status === 'sent') ? 'doing' : 'todo',
      detail: allIn ? 'Đã nhận đủ / đã đóng đơn.' : open.length ? open.join(' · ') : 'Chưa có hàng về.',
      link: { to: live.length === 1 ? `/bua-trua/nhan-hang?don=${live[0].id}` : '/bua-trua/nhan-hang', label: 'Nhận hàng' },
    });
  }

  // 6. Xuất bếp
  const posted = issues.filter((i) => i.status === 'POSTED');
  const drafts = issues.filter((i) => i.status === 'DRAFT');
  const missing = (cost?.foods ?? []).filter((f) => f.variance.startsWith('-'));
  steps.push({
    key: 'xuat',
    title: 'Xuất bếp',
    state: drafts.length ? 'doing' : posted.length && !missing.length ? 'done' : posted.length ? 'doing' : 'todo',
    detail: drafts.length
      ? `Có ${drafts.length} phiếu xuất nháp chưa chốt.`
      : posted.length
        ? missing.length
          ? `Còn thiếu: ${missing.map((f) => `${f.food_name} ${formatQty(f.variance.slice(1), f.unit)}`).join(', ')}.`
          : `Đã xuất ${posted.map((i) => i.code).join(', ')}.`
        : 'Chưa xuất cho bếp.',
    link: { to: `/bua-trua/xuat-bep${q}`, label: 'Xuất bếp' },
  });

  // 7. Đóng ngày
  steps.push({
    key: 'dong',
    title: 'Đóng ngày',
    state: cost?.closed ? 'done' : 'todo',
    detail: cost?.closed && cost.close ? `Đóng bởi ${cost.close.closed_by} lúc ${formatDateTime(cost.close.closed_at)}.` : 'Chưa đóng ngày.',
  });
  return steps;
}
