import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import Link from 'next/link';
import { markedPhotographers } from '@/lib/catalog';
import { CatalogCards } from '@/components/CatalogCards';
import { ru } from '@/i18n/ru';
import { BASE_URL } from '@/lib/sitemap';

export const metadata: Metadata = {
  title: ru.marked.title,
  description: ru.marked.lead,
  alternates: { canonical: `${BASE_URL}/ru/photographers` },
};
export const dynamic = 'force-dynamic';

// Подборка сканирует месяц взвешенных лайков — на каждый заход это дорого,
// а меняется она медленно. Тег catalog: сброс тем же dropCache, что у каталога
const cachedMarked = unstable_cache(() => markedPhotographers(24), ['marked-photographers'], {
  revalidate: 600,
  tags: ['catalog'],
});

/**
 * «Отмеченные» — глобальная подборка авторов по живому отклику заказчиков
 * за месяц (партнёр 2026-08-18, меню «Фотографы»). Без мест и баллов:
 * подборка, а не таблица чемпионата — инвариант доброжелательного рейтинга.
 */
export default async function MarkedPhotographersPage() {
  const cards = await cachedMarked();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:py-14">
      <div className="max-w-6xl w-full">
        <h1 className="t-h1">{ru.marked.title}</h1>
        <p className="mt-2 max-w-2xl t-body muted">{ru.marked.lead}</p>

        {cards.length === 0 ? (
          <div className="mt-8">
            <p className="t-body muted">{ru.marked.empty}</p>
            <Link href="/ru/russia" className="btn btn-outline mt-4 px-4 py-2">{ru.marked.toCatalog}</Link>
          </div>
        ) : (
          <div className="mt-8">
            <CatalogCards cards={cards} cityName="" />
          </div>
        )}
      </div>
    </main>
  );
}
