import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { messageOf } from '../../lib/http';
import { matchesQuery } from '../../lib/text';
import { catalogApi, type Dish } from '../../services/catalog';
import { inventoryApi, type Food, type Supplier } from '../../services/inventory';
import { IconBowl, IconBox, IconChevronDown, IconSearch, IconTruck } from '../icons';
import styles from './GlobalSearch.module.css';

type Scope = 'all' | 'food' | 'dish' | 'supplier';
type Hit = { key: string; kind: Exclude<Scope, 'all'>; title: string; meta: string; to: string };
type Data = { foods: Food[]; dishes: Dish[]; suppliers: Supplier[] };

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'food', label: 'Mặt hàng' },
  { value: 'dish', label: 'Món ăn' },
  { value: 'supplier', label: 'Nhà cung cấp' },
];
const KIND_LABEL: Record<Hit['kind'], string> = { food: 'Mặt hàng', dish: 'Món ăn', supplier: 'Nhà cung cấp' };
const KIND_ICON = { food: IconBox, dish: IconBowl, supplier: IconTruck };
const LIMIT = 8;

/**
 * Ô tìm kiếm toàn app (SF78): lọc mặt hàng, món, nhà cung cấp ngay trên trình duyệt từ API danh sách sẵn có
 * (một trường, dữ liệu nhỏ). Tải lần đầu khi bấm vào ô. Combobox ARIA: ↑/↓ chọn, Enter mở, Esc đóng.
 */
export function GlobalSearch({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const id = useId();
  const [scope, setScope] = useState<Scope>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);
  const areaRef = useRef<HTMLDivElement>(null);

  const load = () => {
    if (data || loading.current) return;
    loading.current = true;
    setError(null);
    Promise.all([inventoryApi.foods(), catalogApi.dishes(), catalogApi.suppliers()])
      .then(([foods, dishes, suppliers]) => setData({ foods, dishes, suppliers }))
      .catch((err) => setError(messageOf(err)))
      .finally(() => {
        loading.current = false;
      });
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (areaRef.current && !areaRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    if (!data || !query.trim()) return [];
    const out: Hit[] = [];
    const want = (k: Scope) => scope === 'all' || scope === k;
    if (want('food'))
      data.foods
        .filter((f) => matchesQuery(query, f.name, f.code))
        .forEach((f) => out.push({ key: `f${f.id}`, kind: 'food', title: f.name, meta: f.code, to: `/kho/mat-hang/${f.id}` }));
    if (want('dish'))
      data.dishes
        .filter((d) => matchesQuery(query, d.name, d.code))
        .forEach((d) => out.push({ key: `d${d.id}`, kind: 'dish', title: d.name, meta: d.code, to: `/mon-an?sua=${d.id}` }));
    if (want('supplier'))
      data.suppliers
        .filter((s) => matchesQuery(query, s.name, s.code))
        .forEach((s) => out.push({ key: `s${s.id}`, kind: 'supplier', title: s.name, meta: s.code, to: `/nha-cung-cap/${s.id}` }));
    return out.slice(0, LIMIT);
  }, [data, query, scope]);

  const go = (hit: Hit) => {
    setOpen(false);
    setQuery('');
    navigate(hit.to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (hits.length ? (i + 1) % hits.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (hits.length ? (i - 1 + hits.length) % hits.length : 0));
    } else if (e.key === 'Enter') {
      const hit = hits[active];
      if (hit) {
        e.preventDefault();
        go(hit);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const listId = `${id}-list`;
  const showList = open && query.trim().length > 0;
  const placeholder = scope === 'all' ? 'Tìm mặt hàng, món, NCC…' : `Tìm ${SCOPES.find((s) => s.value === scope)?.label.toLowerCase()}…`;

  return (
    <div className={[styles.area, className ?? ''].join(' ')} ref={areaRef} role="search">
      <div className={styles.box}>
        <label className={styles.scope}>
          <select aria-label="Phạm vi tìm kiếm" value={scope} onChange={(e) => setScope(e.target.value as Scope)} onFocus={load}>
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <IconChevronDown size={14} className={styles.scopeIcon} />
        </label>
        <input
          type="search"
          className={styles.input}
          value={query}
          placeholder={placeholder}
          aria-label="Tìm kiếm"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && hits[active] ? `${id}-${hits[active].key}` : undefined}
          autoFocus={autoFocus}
          onFocus={() => {
            load();
            setOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <IconSearch size={18} className={styles.searchIcon} />
      </div>
      {showList ? (
        <ul className={styles.list} id={listId} role="listbox" aria-label="Kết quả tìm kiếm">
          {error ? (
            <li className={styles.note} role="presentation">
              {error}
            </li>
          ) : !data ? (
            <li className={styles.note} role="presentation">
              Đang tải…
            </li>
          ) : hits.length === 0 ? (
            <li className={styles.note} role="presentation">
              Không có kết quả cho “{query.trim()}”.
            </li>
          ) : (
            hits.map((h, i) => {
              const Icon = KIND_ICON[h.kind];
              return (
                <li
                  key={h.key}
                  id={`${id}-${h.key}`}
                  role="option"
                  aria-selected={i === active}
                  className={styles.option}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(h);
                  }}
                >
                  <span className={styles.optionIcon}>
                    <Icon size={16} />
                  </span>
                  <span className={styles.optionText}>
                    <span className={styles.optionTitle}>{h.title}</span>
                    <span className={styles.optionMeta}>
                      {KIND_LABEL[h.kind]} · {h.meta}
                    </span>
                  </span>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
