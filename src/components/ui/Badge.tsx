import { Icon } from '@/components/ui/Icon';

// Бейджи. verified — нейтрально-стальной (НЕ красный); editors — тонкая метка;
// pro — тонкая рамка; status — модерация через семантику; count — единственный
// акцентный (счётчик уведомлений). Чистый компонент.

export function VerifiedBadge({ label, size = 16 }: { label: string; size?: number }) {
  return (
    <span title={label} className="inline-flex items-center text-verified" aria-label={label}>
      <Icon name="check-badge" size={size} />
    </span>
  );
}

export function EditorsBadge({ label }: { label: string }) {
  // «Выбор редакции» — знак заслуги, латунь/золото (не красный)
  return (
    <span className="t-caption inline-flex items-center gap-1 rounded-sm border border-recognition px-2 py-0.5 text-recognition">
      <Icon name="star-filled" size={12} />
      {label}
    </span>
  );
}

export function ProBadge({ label }: { label: string }) {
  return (
    <span className="t-caption inline-flex items-center rounded-sm border border-line-2 px-2 py-0.5 text-ink-2">
      {label}
    </span>
  );
}

type StatusKind = 'pending' | 'approved' | 'rejected';
const STATUS_CLASS: Record<StatusKind, string> = {
  pending: 'bg-warning-soft text-warning',
  approved: 'bg-success-soft text-success',
  rejected: 'bg-danger-soft text-danger',
};

export function StatusBadge({ kind, label }: { kind: StatusKind; label: string }) {
  return (
    <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[kind]}`}>
      {label}
    </span>
  );
}

export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="tnum inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink">
      {count > 99 ? '99+' : count}
    </span>
  );
}
