/**
 * Nhà cung cấp (bản vẽ 07): danh sách trái, chi tiết phải. /nha-cung-cap/:id
 * Giấy tờ, hợp đồng, kiểm thực chưa có API nên không hiển thị. "Giá nhập gần nhất" và
 * "Các lần giao gần đây" lấy từ phiếu nhập thật của NCC đó.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { IconArrowIn, IconChevronLeft, IconPencil, IconPlus, IconTruck } from '../../components/icons';
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  KeyValueList,
  PageHeader,
  SearchField,
  SectionTitle,
  Skeleton,
  TextField,
  tableText,
  useToast,
  type Column,
} from '../../components/ui';
import { parseDec, sum, toFixed } from '../../lib/decimal';
import { formatDate, formatMoney, formatMoneyShort, formatShortDate, todayISO, unitLabel } from '../../lib/format';
import { messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { catalogApi } from '../../services/catalog';
import { inventoryApi, type Food, type Receipt, type Supplier } from '../../services/inventory';
import { DocStatusBadge, focusFirstInvalid, useQueryParam, useUpdateParams } from '../inventory/shared';
import s from '../inventory/shared.module.css';
import styles from './SuppliersPage.module.css';

export function SuppliersPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const query = useApiQuery(() => Promise.all([catalogApi.suppliers(), inventoryApi.receipts(), inventoryApi.foods()]), []);
  const [search, setSearch] = useState('');
  const [createParam] = useQueryParam('tao');
  const [editParam] = useQueryParam('sua');
  const updateParams = useUpdateParams();

  const suppliers = useMemo(
    () => [...(query.data?.[0] ?? [])].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, 'vi')),
    [query.data],
  );
  const receipts = query.data?.[1] ?? [];
  const foods = query.data?.[2] ?? [];
  const selected = suppliers.find((x) => String(x.id) === id) ?? null;
  const activeCount = suppliers.filter((x) => x.is_active).length;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? suppliers.filter((x) => x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q) || x.phone.includes(q)) : suppliers;
  }, [suppliers, search]);

  // Màn rộng: mở sẵn NCC đầu tiên như bản vẽ. Điện thoại: giữ danh sách.
  useEffect(() => {
    if (!id && suppliers.length > 0 && window.matchMedia('(min-width: 1024px)').matches) {
      navigate(`/nha-cung-cap/${suppliers[0].id}`, { replace: true });
    }
  }, [id, suppliers, navigate]);

  const editing = editParam && selected && String(selected.id) === editParam ? selected : null;

  return (
    <>
      <PageHeader
        title="Nhà cung cấp"
        subtitle={query.data ? `${activeCount} nhà cung cấp đang hợp tác` : undefined}
        actions={
          <>
            <SearchField value={search} onValueChange={setSearch} placeholder="Tìm nhà cung cấp…" />
            <Button write icon={<IconPlus size={18} strokeWidth={2.4} />} onClick={() => updateParams({ tao: '1', sua: null })}>
              Thêm nhà cung cấp
            </Button>
          </>
        }
      />

      {query.loading ? (
        <Skeleton rows={6} />
      ) : query.error ? (
        <ErrorState message={query.error} onRetry={query.reload} />
      ) : suppliers.length === 0 ? (
        <EmptyState icon={<IconTruck size={32} />} title="Chưa có nhà cung cấp nào" />
      ) : (
        <div className={`${styles.layout} ${id ? styles.hasDetail : ''}`}>
          <nav className={styles.list} aria-label="Danh sách nhà cung cấp">
            {visible.length === 0 ? <p className={styles.empty}>Không có nhà cung cấp phù hợp.</p> : null}
            {visible.map((x) => (
              <NavLink key={x.id} to={`/nha-cung-cap/${x.id}`} className={styles.item} aria-current={String(x.id) === id ? 'true' : undefined}>
                <span className={styles.itemName}>{x.name}</span>
                <span className={styles.itemMeta}>{x.phone || x.code}</span>
                {!x.is_active ? <Badge>Ngừng hợp tác</Badge> : null}
              </NavLink>
            ))}
          </nav>
          <div className={styles.detail}>
            {selected ? (
              <SupplierDetail
                supplier={selected}
                receipts={receipts.filter((r) => r.supplier_id === selected.id)}
                foods={foods}
                onEdit={() => updateParams({ sua: String(selected.id), tao: null })}
              />
            ) : id ? (
              <EmptyState title="Không tìm thấy nhà cung cấp này" action={<Link to="/nha-cung-cap">Về danh sách</Link>} />
            ) : (
              <EmptyState icon={<IconTruck size={32} />} title="Chọn một nhà cung cấp để xem chi tiết" />
            )}
          </div>
        </div>
      )}

      {createParam || editing ? (
        <SupplierForm
          key={editing?.id ?? 'new'}
          supplier={editing}
          onClose={() => updateParams({ tao: null, sua: null })}
          onSaved={(saved) => {
            query.reload();
            updateParams({ tao: null, sua: null });
            if (!editing) navigate(`/nha-cung-cap/${saved.id}`);
          }}
        />
      ) : null}
    </>
  );
}

function SupplierDetail({ supplier, receipts, foods, onEdit }: { supplier: Supplier; receipts: Receipt[]; foods: Food[]; onEdit: () => void }) {
  const navigate = useNavigate();
  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const month = todayISO().slice(0, 7);
  const posted = receipts.filter((r) => r.status === 'POSTED');
  const thisMonth = posted.filter((r) => r.date.startsWith(month));
  const monthTotal = toFixed(sum(thisMonth.map((r) => parseDec(r.total_value) ?? { v: 0n, s: 0 })), 2);
  const allTotal = toFixed(sum(posted.map((r) => parseDec(r.total_value) ?? { v: 0n, s: 0 })), 2);

  // Giá nhập gần nhất của từng mặt hàng (phiếu đã chốt, mới nhất trước).
  const prices = useMemo(() => {
    const seen = new Map<number, { name: string; price: string; unit: string; date: string }>();
    [...posted]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .forEach((r) =>
        r.lines.forEach((l) => {
          if (!seen.has(l.food_id)) {
            seen.set(l.food_id, { name: l.food_name ?? foodById.get(l.food_id)?.name ?? `#${l.food_id}`, price: l.unit_price, unit: foodById.get(l.food_id)?.unit ?? '', date: r.date });
          }
        }),
      );
    return Array.from(seen.values());
  }, [posted, foodById]);

  const recent = [...receipts].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 8);
  const columns: Column<Receipt>[] = [
    { key: 'date', header: 'Ngày', width: '14%', cell: (r) => <span className="num">{formatShortDate(r.date)}</span> },
    {
      key: 'doc',
      header: 'Phiếu nhập',
      width: '16%',
      cell: (r) => (
        <Link className={tableText.rowLink} to={`/kho/phieu-nhap?phieu=${r.id}`}>
          #{r.id}
        </Link>
      ),
    },
    {
      key: 'items',
      header: 'Mặt hàng',
      width: '34%',
      cell: (r) => (
        <span className={tableText.muted}>
          {r.lines[0]?.food_name ?? '—'}
          {r.lines.length > 1 ? ` +${r.lines.length - 1}` : ''}
        </span>
      ),
    },
    { key: 'total', header: 'Tiền hàng', width: '20%', align: 'right', cell: (r) => <span className={tableText.strong}>{formatMoney(r.total_value)}</span> },
    { key: 'status', header: 'Trạng thái', width: '16%', cell: (r) => <DocStatusBadge status={r.status} /> },
  ];

  return (
    <article className={styles.detailInner} aria-labelledby="supplier-name">
      <Link to="/nha-cung-cap" className={styles.back}>
        <IconChevronLeft size={18} /> Tất cả nhà cung cấp
      </Link>
      <header className={styles.detailHead}>
        <div>
          <h2 className={styles.name} id="supplier-name">
            {supplier.name}
          </h2>
          <p className={styles.sub}>
            {supplier.phone ? <a href={`tel:${supplier.phone.replace(/\s+/g, '')}`}>{supplier.phone}</a> : 'Chưa có số điện thoại'} · Mã {supplier.code}
            {supplier.is_active ? '' : ' · Ngừng hợp tác'}
          </p>
        </div>
        <div className={styles.detailActions}>
          <Button variant="secondary" write icon={<IconPencil size={16} />} onClick={onEdit}>
            Sửa
          </Button>
          <Button write icon={<IconArrowIn size={18} />} disabled={!supplier.is_active} onClick={() => navigate(`/kho/phieu-nhap?tao=1&ncc=${supplier.id}`)}>
            Tạo phiếu nhập
          </Button>
        </div>
      </header>

      <p className={`${styles.summary} num`}>
        Tháng này: <strong>{thisMonth.length}</strong> lần giao đã chốt, <strong>{formatMoneyShort(monthTotal)}</strong> tiền hàng. Từ trước đến nay{' '}
        <strong>{posted.length}</strong> phiếu, <strong>{formatMoneyShort(allTotal)}</strong>.
      </p>

      <div className={styles.columns}>
        <section aria-labelledby="price-title">
          <div className={styles.sectionHead}>
            <SectionTitle id="price-title">Giá nhập gần nhất</SectionTitle>
          </div>
          {prices.length === 0 ? (
            <p className={styles.empty}>Chưa có phiếu nhập đã chốt.</p>
          ) : (
            <ul className={styles.priceList}>
              {prices.map((p) => (
                <li key={p.name} className={styles.priceRow}>
                  <span>
                    {p.name}
                    <span className={styles.priceDate}> · {formatShortDate(p.date)}</span>
                  </span>
                  <strong className="num">
                    {formatMoney(p.price)}
                    {p.unit ? `/${unitLabel(p.unit)}` : ''}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="contact-title">
          <div className={styles.sectionHead}>
            <SectionTitle id="contact-title">Thông tin</SectionTitle>
          </div>
          <KeyValueList
            items={[
              { label: 'Mã', value: supplier.code },
              { label: 'Điện thoại', value: supplier.phone || '—' },
              { label: 'Trạng thái', value: supplier.is_active ? <Badge tone="ok">Đang hợp tác</Badge> : <Badge>Ngừng hợp tác</Badge> },
              { label: 'Lần giao gần nhất', value: posted[0] ? formatDate([...posted].sort((a, b) => b.date.localeCompare(a.date))[0].date) : '—' },
            ]}
          />
        </section>
      </div>

      <section aria-labelledby="deliveries-title" className={styles.deliveries}>
        <div className={styles.sectionHead}>
          <SectionTitle id="deliveries-title">Các lần giao gần đây</SectionTitle>
          <Link to="/kho/phieu-nhap">Xem trong kho</Link>
        </div>
        {recent.length === 0 ? (
          <p className={styles.empty}>Chưa có phiếu nhập nào từ nhà cung cấp này.</p>
        ) : (
          <DataTable caption={`Phiếu nhập gần đây của ${supplier.name}`} rows={recent} rowKey={(r) => r.id} columns={columns} minWidth="560px" />
        )}
      </section>
    </article>
  );
}

function SupplierForm({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: (s: Supplier) => void }) {
  const toast = useToast();
  const [code, setCode] = useState(supplier?.code ?? '');
  const [name, setName] = useState(supplier?.name ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [active, setActive] = useState(supplier?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: Record<string, string> = {};
    if (!code.trim()) next.code = 'Hãy nhập mã nhà cung cấp.';
    if (!name.trim()) next.name = 'Hãy nhập tên nhà cung cấp.';
    if (phone.trim() && !/^[0-9+().\s-]{8,20}$/.test(phone.trim())) next.phone = 'Số điện thoại chưa đúng, ví dụ 0912 345 678.';
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirstInvalid('supplier-form');
      return;
    }
    setBusy(true);
    try {
      const body = { code: code.trim(), name: name.trim(), phone: phone.trim(), is_active: active };
      const saved = supplier ? await catalogApi.updateSupplier(supplier.id, body) : await catalogApi.createSupplier(body);
      toast.show(supplier ? `Đã lưu ${body.name}.` : `Đã thêm nhà cung cấp ${body.name}.`);
      onSaved(saved);
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      kicker={supplier ? `Mã ${supplier.code}` : 'Nhà cung cấp mới'}
      title={supplier ? supplier.name : 'Thêm nhà cung cấp'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" form="supplier-form" write busy={busy}>
            {supplier ? 'Lưu thay đổi' : 'Thêm nhà cung cấp'}
          </Button>
        </>
      }
    >
      <form id="supplier-form" className={s.form} onSubmit={onSubmit} noValidate>
        {formError ? (
          <Callout tone="danger" role="alert">
            {formError}
          </Callout>
        ) : null}
        <TextField data-autofocus label="Mã" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} error={errors.code} required maxLength={32} placeholder="ANLAO" />
        <TextField label="Tên nhà cung cấp" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required maxLength={120} placeholder="HTX rau An Lão" />
        <TextField label="Điện thoại" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} maxLength={32} placeholder="0912 345 678" />
        {supplier ? <Checkbox label="Đang hợp tác (bỏ chọn để ngừng, lịch sử phiếu nhập vẫn giữ)" checked={active} onChange={(e) => setActive(e.target.checked)} /> : null}
      </form>
    </Drawer>
  );
}
