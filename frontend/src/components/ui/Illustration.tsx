/**
 * Tranh minh hoạ vẽ bằng SVG (SF78, không dùng ảnh ngoài). Màu lấy từ token qua class CSS, không hex trong file này.
 *  - Scene: đồi ruộng bậc thang 4 lớp, đường ruộng trắng mờ ở 2 lớp trước, trời chuyển màu, mặt trời mờ, 3 làn hơi bếp.
 *  - Tray: khay cơm 4 ngăn nghiêng −6° cho thẻ món (món mặn và nền đổi theo `main`/`bg`).
 *  - Thumb: ô thu nhỏ 30px theo loại hàng (nền pastel + icon).
 */
import { useId } from 'react';
import { IconBox, IconDrop, IconEgg, IconFish, IconGrain, IconLeaf } from '../icons';
import styles from './Illustration.module.css';

export type SceneName = 'suong' | 'dong' | 'binhminh' | 'song';
export const SCENES: { value: SceneName; label: string }[] = [
  { value: 'suong', label: 'Sương' },
  { value: 'dong', label: 'Đồng' },
  { value: 'binhminh', label: 'Bình minh' },
  { value: 'song', label: 'Sông' },
];

const HILLS = [
  'M0 112 C140 86 300 92 450 106 S760 76 910 96 S1110 112 1200 92 V220 H0 Z',
  'M0 136 C190 112 360 118 530 132 S830 106 1010 124 S1150 132 1200 122 V220 H0 Z',
  'M0 158 C180 138 380 148 560 156 S860 136 1040 148 S1160 158 1200 150 V220 H0 Z',
  'M0 182 C220 166 430 172 640 178 S960 164 1200 172 V220 H0 Z',
];
/** Mép trên của 2 đồi trước, dùng lại làm đường ruộng (dịch xuống từng bậc). */
const RIDGES = [
  'M0 158 C180 138 380 148 560 156 S860 136 1040 148 S1160 158 1200 150',
  'M0 182 C220 166 430 172 640 178 S960 164 1200 172',
];
const STEAM = [
  'M300 168 C284 142 316 120 300 96 S284 58 300 30',
  'M326 176 C312 150 340 130 326 108 S312 74 326 48',
  'M930 160 C916 136 944 116 930 92 S916 58 930 34',
];

export function Scene({ name = 'suong', className }: { name?: SceneName; className?: string }) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      className={[styles.scene, styles[`scene-${name}`], className ?? ''].join(' ')}
      viewBox="0 0 1200 220"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={styles.sky1} />
          <stop offset="1" className={styles.sky2} />
        </linearGradient>
        <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        {RIDGES.map((_, i) => (
          <clipPath id={`${uid}-clip${i}`} key={i}>
            <path d={HILLS[i + 2]} />
          </clipPath>
        ))}
      </defs>
      <rect width="1200" height="220" fill={`url(#${uid}-sky)`} />
      <circle cx="560" cy="58" r="36" className={styles.sun} filter={`url(#${uid}-blur)`} />
      {HILLS.map((d, i) => (
        <path key={d} d={d} className={styles[`hill${i + 1}`]} />
      ))}
      {RIDGES.map((d, i) => (
        <g key={d} clipPath={`url(#${uid}-clip${i})`} className={styles.fields}>
          {[9, 18, 27, 36].map((dy) => (
            <path key={dy} d={d} transform={`translate(0 ${dy})`} />
          ))}
        </g>
      ))}
      <g className={styles.steam}>
        {STEAM.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

export type TrayTone = 1 | 2 | 3 | 4 | 5;

/** Khay cơm 4 ngăn: cơm (có hạt), món mặn, rau, canh. */
export function Tray({ main = 1, bg = 1, className }: { main?: TrayTone; bg?: TrayTone; className?: string }) {
  return (
    <svg
      className={[styles.tray, styles[`trayBg${bg}`], className ?? ''].join(' ')}
      viewBox="0 0 300 140"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="300" height="140" className={styles.trayBack} />
      <g transform="rotate(-6 150 80)">
        <rect x="52" y="20" width="200" height="132" rx="20" className={styles.trayBody} />
        <rect x="64" y="32" width="86" height="108" rx="12" className={styles.rice} />
        {[
          [80, 50], [100, 62], [120, 48], [90, 82], [126, 76], [104, 98], [82, 116], [132, 108], [112, 124],
        ].map(([x, y]) => (
          <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="2.4" ry="1.4" className={styles.grain} />
        ))}
        <rect x="158" y="32" width="82" height="50" rx="12" className={styles[`main${main}`]} />
        <circle cx="178" cy="54" r="6" className={styles.mainDot} />
        <circle cx="210" cy="50" r="4" className={styles.mainDot} />
        <rect x="158" y="90" width="38" height="50" rx="12" className={styles.veg} />
        <path d="M166 120c6-10 14-10 22 0" className={styles.vegLine} />
        <rect x="202" y="90" width="38" height="50" rx="12" className={styles.soupCell} />
        <circle cx="221" cy="115" r="12" className={styles.soup} />
      </g>
    </svg>
  );
}

export type ThumbKind = 'veg' | 'meat' | 'sea' | 'dairy' | 'dry' | 'egg' | 'other';
const THUMB_ICON = { veg: IconLeaf, meat: IconBox, sea: IconFish, dairy: IconDrop, dry: IconGrain, egg: IconEgg, other: IconBox };

/** Đoán loại hàng từ tên nhóm/tên mặt hàng (chỉ để chọn icon minh hoạ, không phải dữ liệu nghiệp vụ). */
export function thumbKindFor(...names: (string | null | undefined)[]): ThumbKind {
  const t = names
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
  if (/\b(ca|tom|muc|hai san|thuy san|cua|ngheu)\b/.test(t)) return 'sea';
  if (/\b(thit|heo|bo|ga|vit|suon)\b/.test(t)) return 'meat';
  if (/\btrung\b/.test(t)) return 'egg';
  if (/\b(sua|dau an|nuoc mam|nuoc|dau|giam|xi dau)\b/.test(t)) return 'dairy';
  if (/\b(rau|cu|qua|bi|ca rot|ca chua|chuoi|hanh|toi|nam|dau phu|dau hu)\b/.test(t)) return 'veg';
  if (/\b(gao|bot|mi|bun|pho|kho|gia vi|duong|muoi|hat)\b/.test(t)) return 'dry';
  return 'other';
}

export function Thumb({ kind = 'other' }: { kind?: ThumbKind }) {
  const Icon = THUMB_ICON[kind];
  return (
    <span className={`${styles.thumb} ${styles[`thumb-${kind}`]}`} aria-hidden="true">
      <Icon size={15} />
    </span>
  );
}
