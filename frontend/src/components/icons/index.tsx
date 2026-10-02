/**
 * Bộ icon SVG inline (UI_GUIDE.md). 24×24, stroke currentColor, nét 2, đầu tròn.
 * Path của icon điều hướng lấy nguyên từ design/*.html.
 * Icon trang trí: để mặc định aria-hidden. Icon mang nghĩa: truyền `title`.
 */
import type { ReactNode, SVGProps } from 'react';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  size?: number;
  title?: string;
};

function Svg({ size = 20, title, strokeWidth = 2, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

// Điều hướng (từ bản vẽ)
export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);
export const IconBox = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
    <path d="M3 7l9 4 9-4M12 11v10" />
  </Svg>
);
export const IconBowl = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 11h18a9 9 0 0 1-18 0z" />
    <path d="M8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5M16 7c0-1.5 1-2 1-3.5" />
  </Svg>
);
export const IconClipboardCheck = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1M9 13l2 2 4-4" />
  </Svg>
);
export const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);
export const IconTruck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 6h12v10H2zM14 10h4l3 3v3h-7" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Svg>
);
export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Svg>
);

// Thao tác (từ bản vẽ)
export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const IconPrinter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 8V3h10v5M7 17H4v-7h16v7h-3" />
    <rect x="7" y="14" width="10" height="7" />
  </Svg>
);
export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);
export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4.5v15l12-7.5z" />
  </Svg>
);
export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
    <path d="M10 21h4" />
  </Svg>
);
export const IconSend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />
  </Svg>
);

// Bổ sung, cùng phong cách
export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);
export const IconLogOut = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 17l-5-5 5-5M5 12h11M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
  </Svg>
);
export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 7M17.5 14.3A6 6 0 0 1 21 20" />
  </Svg>
);
export const IconTag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12V4h8l10 10-8 8z" />
    <circle cx="7.5" cy="8" r="1.5" />
  </Svg>
);
export const IconClipboardList = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1M9 11h6M9 15h6" />
  </Svg>
);
export const IconArrowIn = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3" />
  </Svg>
);
export const IconArrowOut = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V3M7 8l5-5 5 5M4 17v3h16v-3" />
  </Svg>
);
export const IconPencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />
  </Svg>
);
export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Svg>
);
export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 16.5v.5" />
  </Svg>
);
export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.5" />
  </Svg>
);
export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 3v5h5M4 13a8 8 0 0 0 14.5 4.5L20 16M20 21v-5h-5" />
  </Svg>
);
export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);
export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const IconMinus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);
export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </Svg>
);

/* ---------- SF78: icon cho khung app xanh ---------- */
export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
  </Svg>
);
export const IconCart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4h2.2l2.1 10.2a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6.2" />
    <circle cx="9.5" cy="19.5" r="1.2" />
    <circle cx="17" cy="19.5" r="1.2" />
  </Svg>
);
export const IconMessage = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" />
  </Svg>
);
export const IconFile = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3h7l5 5v11.5A1.5 1.5 0 0 1 17.5 21h-10A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 7.5 3" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Svg>
);
export const IconSort = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 7h14M8 12h8M11 17h2" />
  </Svg>
);
export const IconSortUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);
export const IconSortDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);
export const IconFilter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8z" />
  </Svg>
);
export const IconLeaf = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z" />
    <path d="M5 19c3-4 6-7 10-9" />
  </Svg>
);
export const IconFish = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12c3-4.5 7-6 10.5-6C17 6 20 9 21 12c-1 3-4 6-7.5 6C10 18 6 16.5 3 12z" />
    <path d="M3 12l-1-3M3 12l-1 3" />
    <circle cx="16.5" cy="11" r=".8" />
  </Svg>
);
export const IconDrop = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5c3.5 4.4 6 7.8 6 10.6A6 6 0 0 1 6 14.1c0-2.8 2.5-6.2 6-10.6z" />
  </Svg>
);
export const IconEgg = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3c3.3 0 6.5 5.4 6.5 10a6.5 6.5 0 0 1-13 0C5.5 8.4 8.7 3 12 3z" />
  </Svg>
);
export const IconGrain = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21V9" />
    <path d="M12 9c-2.6 0-4-1.8-4-4 2.6 0 4 1.8 4 4zM12 9c2.6 0 4-1.8 4-4-2.6 0-4 1.8-4 4zM12 14c-2.6 0-4-1.8-4-4 2.6 0 4 1.8 4 4zM12 14c2.6 0 4-1.8 4-4-2.6 0-4 1.8-4 4z" />
  </Svg>
);
export const IconMore = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="5.5" r="1.1" />
    <circle cx="12" cy="12" r="1.1" />
    <circle cx="12" cy="18.5" r="1.1" />
  </Svg>
);
export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Svg>
);
export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 16V5M7 10l5-5 5 5M5 20h14" />
  </Svg>
);
export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M20.5 16l-5-5-8.5 8" />
  </Svg>
);
export const IconHistory = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />
    <path d="M4 4v4.5h4.5M12 8v4.5l3 1.8" />
  </Svg>
);
export const IconPause = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6v12M15 6v12" />
  </Svg>
);
export const IconDot = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconBan = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M6 6l12 12" />
  </Svg>
);
export const IconArrowUpRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 17L17 7M8 7h9v9" />
  </Svg>
);

/** Logo SchoolFood: 4 làn hơi bếp trắng và 3 hạt gạo, đặt trên ô vuông nền xanh (AppShell). */
export const LogoMark = ({ size = 30, title }: { size?: number; title?: string }) => (
  <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} focusable="false">
    {title ? <title>{title}</title> : null}
    <rect width="30" height="30" rx="9" fill="currentColor" />
    <g fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
      <path d="M7 9.5c2-1.6 4-1.6 6 0s4 1.6 6 0 3-1.2 4-.6" />
      <path d="M7 13.5c2-1.6 4-1.6 6 0s4 1.6 6 0 3-1.2 4-.6" />
      <path d="M7 17.5c2-1.6 4-1.6 6 0s4 1.6 6 0 3-1.2 4-.6" />
      <path d="M7 21.5c2-1.6 4-1.6 6 0s4 1.6 6 0 3-1.2 4-.6" />
    </g>
    <g fill="white">
      <ellipse cx="11" cy="25.4" rx="1.1" ry=".7" />
      <ellipse cx="15" cy="25.8" rx="1.1" ry=".7" />
      <ellipse cx="19" cy="25.4" rx="1.1" ry=".7" />
    </g>
  </svg>
);
