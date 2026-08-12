import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { RU_CITIES } from '@/lib/geo-data';
import { CATEGORIES } from '@/lib/category-data';
import { ru } from '@/i18n/ru';
import { CreatePhotographerForm } from '@/components/admin/CreatePhotographerForm';
import { PageHeader } from '@/components/PageHeader';
import { AdminNav } from '@/components/admin/AdminNav';
import { adminCounters } from '@/lib/admin-counters';

export const metadata: Metadata = { title: ru.adminPhotographers.createTitle };
export const dynamic = 'force-dynamic';

export default async function NewPhotographerPage() {
  if (!(await requireAdmin())) redirect('/ru/login');

  const cities = RU_CITIES.map((c) => ({ slug: c.slug, name: c.nameRu })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const categories = CATEGORIES.map((c) => ({ slug: c.slug, name: c.nameRu }));

  const counters = await adminCounters();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-10">
      <div className="max-w-2xl w-full">
      <AdminNav counters={counters} />
      <PageHeader
        crumbs={[{ href: '/ru/admin', label: ru.adminHome.title }, { href: '/ru/admin/moderation', label: ru.admin.moderationTitle }]}
        title={ru.adminPhotographers.createTitle}
      />
      <p className="mt-1 t-small muted">{ru.adminPhotographers.createLead}</p>
      <div className="mt-6">
        <CreatePhotographerForm cities={cities} categories={categories} />
      </div>
      </div>
    </main>
  );
}
