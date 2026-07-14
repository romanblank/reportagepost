import Link from 'next/link';

// Дружелюбное пустое состояние (app-подача вместо серого текста в пустоте):
// иконка + заголовок + необязательное действие. Серверный компонент.
export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mx-auto mt-16 flex max-w-sm flex-col items-center px-6 text-center">
      {icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-muted">
          {icon}
        </div>
      )}
      <p className="text-lg font-medium">{title}</p>
      {subtitle && <p className="mt-1.5 text-sm muted">{subtitle}</p>}
      {action && (
        <Link href={action.href} className="btn btn-accent mt-5 px-4 py-2">
          {action.label}
        </Link>
      )}
    </div>
  );
}
