import Link from 'next/link';

interface EmptyAction {
  href: string;
  label: string;
  variant?: 'accent' | 'outline';
}

// Дружелюбное пустое состояние (app-подача вместо серого текста в пустоте):
// иконка + заголовок + одно или несколько действий. Серверный компонент.
export function EmptyState({
  icon,
  title,
  subtitle,
  action,
  actions,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: EmptyAction;
  actions?: EmptyAction[];
}) {
  const acts = actions ?? (action ? [action] : []);
  return (
    <div className="mx-auto mt-16 flex max-w-sm flex-col items-center px-6 text-center">
      {icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-media bg-surface-2 text-muted">
          {icon}
        </div>
      )}
      <p className="t-h3">{title}</p>
      {subtitle && <p className="mt-1.5 t-small muted">{subtitle}</p>}
      {acts.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {acts.map((a) => (
            <Link key={a.href} href={a.href}
              className={`btn px-4 py-2 ${a.variant === 'outline' ? 'btn-outline' : 'btn-accent'}`}>
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
