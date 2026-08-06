import Link from 'next/link';
import { ru } from '@/i18n/ru';

/**
 * Постраничная навигация ссылками, а не кнопкой «ещё».
 *
 * Ссылка на страницу открывается роботом и пересылается человеком — «загрузить
 * ещё» не делает ни того, ни другого, а длинную тему как раз и пересылают
 * куском.
 */
export function Pager({ base, page, total, perPage }: { base: string; page: number; total: number; perPage: number }) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;

  const href = (p: number) => (p <= 1 ? base : `${base}?page=${p}`);

  return (
    <nav className="mt-6 flex flex-wrap items-center gap-2" aria-label={ru.pager.label}>
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn btn-outline btn-sm">{ru.pager.prev}</Link>
      ) : null}
      <span className="t-caption muted">{ru.pager.of(page, pages)}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className="btn btn-outline btn-sm">{ru.pager.next}</Link>
      ) : null}
    </nav>
  );
}
