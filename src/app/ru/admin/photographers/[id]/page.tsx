import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { thumbVariantUrl } from '@/lib/photos';
import { tierOf } from '@/lib/subscription';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { ru } from '@/i18n/ru';
import { AdminPhotographerManager } from '@/components/admin/AdminPhotographerManager';
import { PageHeader } from '@/components/PageHeader';
import { AdminNav } from '@/components/admin/AdminNav';
import { adminCounters } from '@/lib/admin-counters';

export const metadata: Metadata = { title: ru.adminPhotographers.manage };
export const dynamic = 'force-dynamic';

export default async function ManagePhotographerPage(props: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) redirect('/ru/login');
  const { id } = await props.params;

  const profile = await db.photographerProfile.findUnique({
    where: { id },
    include: {
      user: true,
      city: true,
      categories: { include: { category: true } },
      photos: { orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'desc' }], select: { id: true, storageKey: true } },
    },
  });
  if (!profile) notFound();

  const categories = profile.categories.map((c) => ({ slug: c.category.slug, name: categoryNameRu(c.category.slug) }));
  const photographerTier = await tierOf(profile.userId);

  const counters = await adminCounters();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
      <AdminNav counters={counters} />
      <PageHeader
        crumbs={[{ href: '/ru/admin', label: ru.adminHome.title }, { href: '/ru/admin/moderation', label: ru.admin.moderationTitle }]}
        title={`${profile.user.firstName} ${profile.user.lastName}`}
      />
      <p className="mt-1.5 text-sm muted">
        @{profile.username} · {cityNameRu(profile.city.slug)} · {profile.categories.map((c) => categoryNameRu(c.category.slug)).join(' · ')}
      </p>
      <div className="mt-3 flex gap-4 text-sm">
        <Link href={`/ru/admin/photographers/${profile.id}/edit`} className="underline">{ru.adminPhotographers.editAnketa}</Link>
        <Link href={`/ru/photographer/${profile.username}`} className="underline">{ru.adminPhotographers.viewPage}</Link>
      </div>

      <div className="mt-6 card p-5 sm:p-6">
        <AdminPhotographerManager
          profileId={profile.id}
          initialStatus={profile.status}
          categories={categories}
          initialPhotos={profile.photos.map((p) => ({ id: p.id, thumb: thumbVariantUrl(p.storageKey) }))}
          initialTier={photographerTier}
        />
      </div>
    </main>
  );
}
