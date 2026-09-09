import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { favoritesFor } from '@/lib/favorites';
import { cityNameRu } from '@/lib/geo-data';
import { thumbVariantUrl } from '@/lib/photos';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.favoritesPage.title };
export const dynamic = 'force-dynamic';

/**
 * «В избранном» — раздел меню «Фотографы» (структура партнёра 2026-08-18).
 * Раньше избранное жило только в кабинете заказчика; фотографы тоже сохраняют
 * коллег, и путь из меню короче, чем через кабинет.
 */
export default async function FavoritesPage() {
  const session = await getSession();
  const t = ru.favoritesPage;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:py-14">
      <div className="max-w-5xl w-full">
        <h1 className="t-h1">{t.title}</h1>
        {!session ? (
          <div className="mt-6">
            <p className="t-body muted">{t.guest}</p>
            <Link href={`/ru/login?next=${encodeURIComponent('/ru/favorites')}`} className="btn btn-accent mt-4 px-4 py-2">
              {ru.nav.login}
            </Link>
          </div>
        ) : (
          <FavList userId={session.userId} />
        )}
      </div>
    </main>
  );
}

async function FavList({ userId }: { userId: string }) {
  const favorites = await favoritesFor(userId);
  const t = ru.favoritesPage;
  if (favorites.length === 0) {
    return (
      <div className="mt-6">
        <p className="t-body muted">{t.empty}</p>
        <Link href="/ru/russia" className="btn btn-outline mt-4 px-4 py-2">{t.toCatalog}</Link>
      </div>
    );
  }
  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {favorites.map((p) => (
        <li key={p.id} className="card p-3">
          <Link href={`/ru/photographer/${p.username}`} className="block">
            <span className="font-medium">{p.user.firstName} {p.user.lastName}</span>
            <span className="block t-fine muted">{cityNameRu(p.city.slug)}</span>
            {p.photos.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-1 overflow-hidden rounded-media">
                {p.photos.map((ph) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={ph.id} src={thumbVariantUrl(ph.storageKey)} alt="" loading="lazy"
                    className="aspect-square w-full object-cover" />
                ))}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
