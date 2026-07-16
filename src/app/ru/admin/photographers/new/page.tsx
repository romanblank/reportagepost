import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { RU_CITIES } from '@/lib/geo-data';
import { CATEGORIES } from '@/lib/category-data';
import { ru } from '@/i18n/ru';
import { CreatePhotographerForm } from '@/components/admin/CreatePhotographerForm';

export const metadata: Metadata = { title: ru.adminPhotographers.createTitle };
export const dynamic = 'force-dynamic';

export default async function NewPhotographerPage() {
  if (!(await requireAdmin())) redirect('/ru/login');

  const cities = RU_CITIES.map((c) => ({ slug: c.slug, name: c.nameRu })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const categories = CATEGORIES.map((c) => ({ slug: c.slug, name: c.nameRu }));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <Link href="/ru/cabinet" className="text-sm underline muted">← {ru.cabinet.title}</Link>
      <h1 className="t-h2 mt-3">{ru.adminPhotographers.createTitle}</h1>
      <p className="mt-1 text-sm muted">{ru.adminPhotographers.createLead}</p>
      <div className="mt-6">
        <CreatePhotographerForm cities={cities} categories={categories} />
      </div>
    </main>
  );
}
