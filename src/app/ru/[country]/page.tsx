import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { cityNameRu } from '@/lib/geo-data';
import { ru } from '@/i18n/ru';
import { BASE_URL } from '@/lib/sitemap';

// Динамическая: корневой layout читает cookies (сессия в шапке) → всё дерево
// динамическое, ISR тут не работает (аудит: revalidate был мёртвым).
export const dynamic = 'force-dynamic';

async function findCountry(slug: string) {
  return db.country.findFirst({ where: { slug, active: true } });
}

export async function generateMetadata(props: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const { country } = await props.params;
  const c = await findCountry(country);
  if (!c) return { title: ru.profile.notFound };
  return {
    title: ru.country.title,
    description: ru.country.metaDescription,
    alternates: { canonical: `${BASE_URL}/ru/${country}` },
  };
}

export default async function CountryPage(props: { params: Promise<{ country: string }> }) {
  const { country } = await props.params;
  const c = await findCountry(country);
  if (!c) notFound();

  // Города с числом одобренных фотографов, активные первыми
  const cities = await db.city.findMany({
    where: { countryId: c.id },
    orderBy: [{ active: 'desc' }, { slug: 'asc' }],
    select: {
      slug: true,
      _count: { select: { profiles: { where: { status: 'APPROVED' } } } },
    },
  });

  // Показываем только города, где есть кого показать. Пустой город — это
  // страница с текстом «здесь пока никого» и кодом 200: тонкий контент,
  // который при открытой индексации попадёт в выдачу и будет тянуть вниз
  // впечатление обо всём каталоге. Ссылку на него незачем давать и боту, и
  // человеку — он всё равно упрётся в пустоту.
  const shown = cities.filter((city) => city._count.profiles > 0);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="t-h1">{ru.country.title}</h1>
      <p className="mt-2 muted">{ru.country.lead}</p>
      {shown.length === 0 && <p className="mt-8 muted">{ru.country.empty}</p>}
      <ul className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((city) => (
          <li key={city.slug}>
            <Link href={`/ru/${country}/${city.slug}`}
              className="card card-hover flex items-baseline justify-between px-4 py-3">
              <span>{cityNameRu(city.slug)}</span>
              {city._count.profiles > 0 && (
                <span className="text-sm muted">{city._count.profiles}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
