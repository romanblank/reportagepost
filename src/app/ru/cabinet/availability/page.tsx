import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { ru } from '@/i18n/ru';
import { RU_CITIES } from '@/lib/geo-data';
import { travelPlansFor } from '@/lib/travel';
import { AvailabilityCalendar } from '@/components/AvailabilityCalendar';
import { TravelPlans } from '@/components/TravelPlans';
import { PageHeader } from '@/components/PageHeader';
import { CabinetNav } from '@/components/CabinetNav';

export const metadata: Metadata = { title: ru.availability.title };
export const dynamic = 'force-dynamic';

export default async function AvailabilityPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  if (session.role !== 'PHOTOGRAPHER') redirect('/ru/cabinet');

  const profile = await db.photographerProfile.findUnique({
    where: { userId: session.userId },
    select: { id: true, status: true, city: { select: { slug: true } } },
  });
  const approved = profile?.status === 'APPROVED';

  const from = new Date(new Date().setUTCHours(0, 0, 0, 0));
  const [busy, plans] = approved
    ? await Promise.all([
        db.busyDate.findMany({
          where: { profileId: profile.id, date: { gte: from } },
          orderBy: { date: 'asc' },
          select: { date: true },
        }),
        travelPlansFor(session.userId),
      ])
    : [[], []];

  // Города назначения: все РФ-города, кроме своего
  const cities = RU_CITIES.filter((c) => c.slug !== profile?.city.slug)
    .map((c) => ({ slug: c.slug, name: c.nameRu }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
      <CabinetNav approved={approved} />
      <PageHeader
        crumbs={[{ href: '/ru/cabinet', label: ru.cabinet.title }]}
        title={ru.cabinet.availabilityLink}
      />
      <h1 className="mt-3 t-h2">{ru.availability.title}</h1>

      {!approved ? (
        <p className="mt-4 text-sm muted">{ru.availability.locked}</p>
      ) : (
        <>
          <p className="mt-2 text-sm muted">{ru.availability.lead}</p>
          <div className="mt-6 card p-4">
            <AvailabilityCalendar initialBusy={busy.map((b) => b.date.toISOString().slice(0, 10))} />
          </div>

          <h2 className="mt-8 t-title">{ru.travel.title}</h2>
          <p className="mt-1 text-sm muted">{ru.travel.lead}</p>
          <div className="mt-4 card p-4">
            <TravelPlans
              initialPlans={plans.map((p) => ({
                id: p.id,
                citySlug: p.city.slug,
                fromDate: p.fromDate.toISOString().slice(0, 10),
                toDate: p.toDate.toISOString().slice(0, 10),
              }))}
              cities={cities}
            />
          </div>
        </>
      )}
    </main>
  );
}
