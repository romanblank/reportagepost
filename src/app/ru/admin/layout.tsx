import type { ReactNode } from "react";

// Админка остаётся в светлой «Editorial Gallery» — редизайним отдельным этапом.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="surface-light min-h-screen">{children}</div>;
}
