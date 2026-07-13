import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { webVariantUrl } from '@/lib/photos';
import { formatRubMinor } from '@/lib/money';
import { ru } from '@/i18n/ru';

export const revalidate = 600;

async function findProfile(username: string) {
  return db.photographerProfile.findFirst({
    where: { username, status: 'APPROVED' },
    include: {
      user: true,
      city: true,
      categories: { include: { category: true } },
      packages: { orderBy: { sortOrder: 'asc' } },
      photos: { where: { status: 'APPROVED' }, orderBy: { publishedAt: 'desc' } },
    },
  });
}

export async function generateMetadata(props: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await props.params;
  const profile = await findProfile(username);
  if (!profile) return { title: ru.profile.notFound };
  const title = `${profile.user.firstName} ${profile.user.lastName} — ${ru.catalog.title(cityNameRu(profile.city.slug))}`;
  return { title, description: profile.bio ?? title };
}

export default async function ProfilePage(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params;
  const profile = await findProfile(username);
  if (!profile) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {profile.user.firstName} {profile.user.lastName}
        </h1>
        <p className="mt-1 text-sm opacity-60">
          {ru.profile.cityLabel}: {cityNameRu(profile.city.slug)} ·{' '}
          {profile.categories.map((c) => categoryNameRu(c.category.slug)).join(' · ')}
        </p>
        {profile.bio && <p className="mt-3 max-w-2xl">{profile.bio}</p>}
      </header>

      {profile.packages.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-medium">{ru.profile.pricesTitle}</h2>
          <ul className="mt-2 flex flex-wrap gap-3">
            {profile.packages.map((pkg) => (
              <li key={pkg.id} className="rounded-lg border px-4 py-2 text-sm">
                {ru.catalog.packageLabel(pkg.hours, formatRubMinor(pkg.priceMinor))}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium">{ru.profile.portfolioTitle}</h2>
        <div className="mt-3 columns-2 gap-2 md:columns-3">
          {profile.photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={webVariantUrl(photo.storageKey)}
              alt=""
              loading="lazy"
              width={photo.width}
              height={photo.height}
              className="mb-2 w-full rounded-lg"
            />
          ))}
        </div>
      </section>
    </main>
  );
}
