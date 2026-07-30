import type { ReactNode } from "react";

// Кабинет пока остаётся в светлой «Editorial Gallery» — тёмная тема v9
// раскатывается по публичке, кабинет редизайним отдельным этапом.
// .surface-light переопределяет токены и красит светлый фон над тёмным body.
export default function CabinetLayout({ children }: { children: ReactNode }) {
  return <div className="surface-light min-h-screen">{children}</div>;
}
