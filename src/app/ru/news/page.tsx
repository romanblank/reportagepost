import type { Metadata } from 'next';
import { SITE_NEWS } from '@/lib/site-news';
import { formatDateRu } from '@/lib/date-format';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.siteNews.title };

/** Новости сайта — бюллетень изменений (раздел «О сайте», партнёр 2026-08-18). */
export default function NewsPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:py-14">
      <div className="max-w-2xl w-full">
        <h1 className="t-h1">{ru.siteNews.title}</h1>
        <p className="mt-2 t-body muted">{ru.siteNews.lead}</p>
        <ul className="mt-8 flex flex-col gap-8">
          {SITE_NEWS.map((n) => (
            <li key={`${n.date}-${n.title}`} className="border-t border-line pt-6">
              <p className="t-caption muted">{formatDateRu(new Date(n.date))}</p>
              <h2 className="mt-1 t-h3 text-balance">{n.title}</h2>
              <p className="mt-2 t-body leading-relaxed">{n.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
