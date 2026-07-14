import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { cityNameRu } from '@/lib/geo-data';
import { ru } from '@/i18n/ru';

export const revalidate = 600; // список городов меняется редко; НЕ читает searchParams

async function findCountry(slug: string) {
  return db.country.findFirst({ where: { slug, active: true } });
}

export async function generateMetadata(props: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const { country } = await props.params;
  const c = await findCountry(country);
  return { title: c ? ru.country.title : ru.profile.notFound };
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

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-semibold sm:text-4xl">{ru.country.title}</h1>
      <p className="mt-2 muted">{ru.country.lead}</p>
      <ul className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {cities.map((city) => (
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
