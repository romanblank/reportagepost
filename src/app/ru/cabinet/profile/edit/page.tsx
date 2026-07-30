import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { avatarUrl } from '@/lib/photos';
import { parseFaq } from '@/lib/faq';
import { RU_CITIES } from '@/lib/geo-data';
import { CATEGORIES } from '@/lib/category-data';
import { ru } from '@/i18n/ru';
import { EditProfileForm } from './EditProfileForm';

export const metadata: Metadata = { title: ru.editProfile.title };
export const dynamic = 'force-dynamic';

export default async function EditProfilePage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  if (session.role !== 'PHOTOGRAPHER') redirect('/ru/cabinet');

  const profile = await db.photographerProfile.findUnique({
    where: { userId: session.userId },
    include: { packages: { orderBy: { sortOrder: 'asc' } }, city: true, categories: true },
  });
  if (!profile) redirect('/ru/onboarding');

  const cities = RU_CITIES.map((c) => ({ slug: c.slug, name: c.nameRu })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const categories = CATEGORIES.map((c) => ({ slug: c.slug, name: c.nameRu }));
  const catSlugById = new Map(await db.category.findMany().then((cs) => cs.map((c) => [c.id, c.slug] as const)));

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="t-h1">{ru.editProfile.title}</h1>
      <EditProfileForm
        cities={cities}
        categories={categories}
        avatar={profile.avatarKey ? avatarUrl(profile.avatarKey) : null}
        initial={{
          username: profile.username,
          citySlug: profile.city.slug,
          categorySlugs: profile.categories.map((c) => catSlugById.get(c.categoryId)).filter((s): s is string => Boolean(s)),
          bio: profile.bio ?? '',
          siteUrl: profile.siteUrl ?? '',
          whatsapp: profile.whatsapp ?? '',
          telegram: profile.telegram ? `@${profile.telegram}` : '',
          experienceYears: profile.experienceYears ?? null,
          equipment: profile.equipment ?? '',
          cameras: profile.cameras,
          lenses: profile.lenses,
          lighting: profile.lighting,
          teamInfo: profile.teamInfo ?? '',
          doesVideo: profile.doesVideo,
          showreelUrls: profile.showreelUrls,
          languages: profile.languages,
          faq: parseFaq(profile.faq),
          packages: profile.packages.map((p) => ({ hours: p.hours, priceRub: Math.round(p.priceMinor / 100) })),
        }}
      />
    </main>
  );
}
