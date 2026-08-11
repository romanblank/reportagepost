import Link from 'next/link';

/**
 * Шапка внутренней страницы: путь наверх, заголовок, пояснение, действия.
 *
 * Раньше каждая страница решала это сама: где-то стояла ссылка «← Кабинет»,
 * где-то её не было вовсе, и человек упирался в тупик — из очереди модерации,
 * из аудита, из проверки почты вернуться было нечем, кроме кнопки браузера.
 * Разнобой заметен не по одной странице, а при переходах между ними: именно
 * тогда интерфейс перестаёт ощущаться сделанным.
 *
 * Крошки — не украшение: на глубоких страницах (автор → правка анкеты) они
 * единственный способ понять, где ты и куда возвращаться.
 */
export type Crumb = { href: string; label: string };

export function PageHeader({
  crumbs,
  title,
  lead,
  actions,
}: {
  /** Путь от ближайшего раздела к текущей странице; последний элемент — текущая. */
  crumbs: Crumb[];
  title: string;
  lead?: string;
  /** Кнопки страницы — они относятся к заголовку, а не к содержимому. */
  actions?: React.ReactNode;
}) {
  const parent = crumbs[crumbs.length - 1];

  return (
    <header className="mb-6">
      {parent ? (
        <nav aria-label="breadcrumb" className="t-caption flex flex-wrap items-center gap-x-2 gap-y-1 muted">
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex items-center gap-2">
              {i > 0 ? <span aria-hidden>·</span> : null}
              <Link href={c.href} className="underline hover:text-ink">{c.label}</Link>
            </span>
          ))}
        </nav>
      ) : null}

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-h2 text-balance">{title}</h1>
          {lead ? <p className="mt-1 max-w-2xl text-sm muted">{lead}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
