import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { RU_CITIES } from '@/lib/geo-data';
import { CATEGORIES } from '@/lib/category-data';
import { slugFromName } from '@/lib/translit';
import { ru } from '@/i18n/ru';
import { OnboardingForm } from './OnboardingForm';

export const metadata: Metadata = { title: ru.onboarding.title };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  if (session.role !== 'PHOTOGRAPHER') redirect('/ru/cabinet');

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { firstName: true, lastName: true },
  });
  // Авто-username из имени (оператор: не заставлять придумывать slug)
  const suggestedUsername = user ? slugFromName(user.firstName, user.lastName) : '';

  const cities = [...RU_CITIES]
    .sort((a, b) => Number(b.active ?? false) - Number(a.active ?? false) || a.nameRu.localeCompare(b.nameRu, 'ru'))
    .map((c) => ({ slug: c.slug, nameRu: c.nameRu }));

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="text-3xl font-semibold">{ru.onboarding.title}</h1>
      <p className="mt-2 text-sm muted">{ru.onboarding.lead}</p>
      <div className="card mt-6 p-6 sm:p-8">
        <OnboardingForm
          cities={cities}
          categories={CATEGORIES.map((c) => ({ slug: c.slug, nameRu: c.nameRu }))}
          suggestedUsername={suggestedUsername}
        />
      </div>
    </main>
  );
}
