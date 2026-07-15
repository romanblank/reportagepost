import type { SVGProps } from 'react';

// Единый контурный набор иконок (stroke 1.6) — заменяет raw-глифы (★♥✓→←).
// Чистый компонент (без 'use client', без хуков) — годится в серверных и
// клиентских. Цвет наследуется через currentColor.

export type IconName =
  | 'star' | 'star-half' | 'star-filled'
  | 'heart' | 'heart-filled'
  | 'check' | 'check-badge'
  | 'chevron-left' | 'chevron-right'
  | 'message' | 'bell' | 'camera' | 'user' | 'search' | 'calendar' | 'x' | 'plus';

const PATHS: Record<IconName, { d: string; fill?: boolean }> = {
  star: { d: 'M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 17.77l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85L12 3.5z' },
  'star-filled': { d: 'M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 17.77l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85L12 3.5z', fill: true },
  'star-half': { d: 'M12 3.5v14.27l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85L12 3.5z', fill: true },
  heart: { d: 'M12 20s-7-4.35-9.33-8.03C1.3 9.5 2.28 6.5 5.1 6.02 7 5.7 8.9 6.6 12 9.5c3.1-2.9 5-3.8 6.9-3.48 2.82.48 3.8 3.48 2.43 5.95C19 15.65 12 20 12 20z' },
  'heart-filled': { d: 'M12 20s-7-4.35-9.33-8.03C1.3 9.5 2.28 6.5 5.1 6.02 7 5.7 8.9 6.6 12 9.5c3.1-2.9 5-3.8 6.9-3.48 2.82.48 3.8 3.48 2.43 5.95C19 15.65 12 20 12 20z', fill: true },
  check: { d: 'M4.5 12.5l5 5 10-11' },
  'check-badge': { d: 'M9 12l2 2 4-4M12 3l2.09 1.26 2.44-.2.99 2.24 2.02 1.38-.66 2.36.66 2.36-2.02 1.38-.99 2.24-2.44-.2L12 21l-2.09-1.26-2.44.2-.99-2.24-2.02-1.38.66-2.36-.66-2.36 2.02-1.38.99-2.24 2.44.2L12 3z' },
  'chevron-left': { d: 'M15 5l-7 7 7 7' },
  'chevron-right': { d: 'M9 5l7 7-7 7' },
  message: { d: 'M4 5h16v11H8l-4 3.5V5z' },
  bell: { d: 'M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 004 0' },
  camera: { d: 'M4 8h3l2-2.5h6L17 8h3v11H4V8zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z' },
  user: { d: 'M4 20c0-3.5 3.5-5.5 8-5.5s8 2 8 5.5M12 11.5a4 4 0 100-8 4 4 0 000 8z' },
  search: { d: 'M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15zM21 21l-5.2-5.2' },
  calendar: { d: 'M4 6h16v15H4V6zM4 10h16M8 3v4M16 3v4' },
  x: { d: 'M6 6l12 12M18 6L6 18' },
  plus: { d: 'M12 5v14M5 12h14' },
};

export function Icon({
  name,
  size = 20,
  className,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const p = PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={p.fill ? 'currentColor' : 'none'}
      stroke={p.fill ? 'none' : 'currentColor'}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d={p.d} />
    </svg>
  );
}
