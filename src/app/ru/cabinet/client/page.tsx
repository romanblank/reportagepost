import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { favoritesFor, inquiriesByClient } from '@/lib/favorites';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { thumbVariantUrl } from '@/lib/photos';
import { formatRubMinor } from '@/lib/money';
import { ru } from '@/i18n/ru';
import { LogoutButton } from '@/components/LogoutButton';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';

export const metadata: Metadata = { title: ru.clientCabinet.title };
export const dynamic = 'force-dynamic';

export default async function ClientCabinetPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');

  const [favorites, inquiries] = await Promise.all([
    favoritesFor(session.userId),
    inquiriesByClient(session.userId),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">{ru.clientCabinet.title}</h1>
        <Link href="/ru/inquiry" className="btn btn-accent px-3 py-1.5">
          {ru.clientCabinet.newInquiry}
        </Link>
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-medium">{ru.clientCabinet.favoritesTitle}</h2>
        {favorites.length === 0 ? (
          <p className="mt-2 text-sm muted">{ru.clientCabinet.favoritesEmpty}</p>
        ) : (
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {favorites.map((p) => (
              <li key={p.id} className="card p-3">
                <Link href={`/ru/photographer/${p.username}`} className="block">
                  <span className="font-medium">{p.user.firstName} {p.user.lastName}</span>
                  <span className="block text-xs muted">{cityNameRu(p.city.slug)}</span>
                  <div className="mt-2 grid grid-cols-3 gap-1 overflow-hidden rounded-lg">
                    {p.photos.map((ph) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={ph.id} src={thumbVariantUrl(ph.storageKey)} alt="" loading="lazy"
                        className="aspect-square w-full object-cover" />
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">{ru.clientCabinet.myInquiriesTitle}</h2>
        {inquiries.length === 0 ? (
          <p className="mt-2 text-sm muted">{ru.clientCabinet.myInquiriesEmpty}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {inquiries.map((i) => (
              <li key={i.id} className="card p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="opacity-70">
                    {cityNameRu(i.city.slug)}
                    {i.category ? ` · ${categoryNameRu(i.category.slug)}` : ''}
                  </span>
                  <span className="text-xs opacity-50">
                    {i.status === 'OPEN' ? ru.clientCabinet.inquiryStatusOpen : ru.clientCabinet.inquiryStatusClosed}
                  </span>
                </div>
                <p className="mt-1">{i.description}</p>
                {i.budgetMinor != null && (
                  <p className="mt-1 opacity-60">{formatRubMinor(i.budgetMinor)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 border-t border-line pt-5 sm:hidden">
        <LogoutButton />
      </div>

      <section className="mt-8 border-t border-line pt-5">
        <p className="text-sm font-medium">{ru.account.dangerTitle}</p>
        <div className="mt-2"><DeleteAccountButton /></div>
      </section>
    </main>
  );
}
