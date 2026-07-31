import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { parseFaq } from '@/lib/faq';
import { RU_CITIES } from '@/lib/geo-data';
import { CATEGORIES } from '@/lib/category-data';
import { ru } from '@/i18n/ru';
import { EditProfileForm } from '@/app/ru/cabinet/profile/edit/EditProfileForm';

export const metadata: Metadata = { title: ru.editProfile.title };
export const dynamic = 'force-dynamic';

// Правка анкеты заведённого фотографа админом. Та же форма, что и у фотографа,
// но PATCH идёт на админ-эндпоинт по profileId. Аватар грузится через self-роут —
// в админ-режиме скрыт (showAvatar={false}).
export default async function AdminEditProfilePage(props: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) redirect('/ru/login');
  const { id } = await props.params;

  const profile = await db.photographerProfile.findUnique({
    where: { id },
    include: { packages: { orderBy: { sortOrder: 'asc' } }, city: true, categories: true, user: true },
  });
  if (!profile) notFound();

  const cities = RU_CITIES.map((c) => ({ slug: c.slug, name: c.nameRu })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const categories = CATEGORIES.map((c) => ({ slug: c.slug, name: c.nameRu }));
  const catSlugById = new Map(await db.category.findMany().then((cs) => cs.map((c) => [c.id, c.slug] as const)));

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-10">
      <Link href={`/ru/admin/photographers/${profile.id}`} className="text-sm underline muted">← {ru.adminPhotographers.manage}</Link>
      <h1 className="t-h1 mt-3">{ru.editProfile.title}</h1>
      <p className="mt-1 text-sm muted">{profile.user.firstName} {profile.user.lastName} · @{profile.username}</p>
      <EditProfileForm
        endpoint={`/api/admin/photographers/${profile.id}/edit`}
        showAvatar={false}
        cities={cities}
        categories={categories}
        avatar={null}
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
          showPhone: profile.showPhone,
          hasPhone: Boolean(profile.user.phone),
          showreelUrls: profile.showreelUrls,
          languages: profile.languages,
          faq: parseFaq(profile.faq),
          packages: profile.packages.map((p) => ({ hours: p.hours, priceRub: Math.round(p.priceMinor / 100) })),
        }}
      />
    </main>
  );
}
