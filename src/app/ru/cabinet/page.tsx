import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { inquiriesForPhotographer } from '@/lib/inquiries';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { formatRubMinor } from '@/lib/money';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.cabinet.title };
export const dynamic = 'force-dynamic'; // всегда свежие заявки/статус

const STATUS_LABEL = {
  PENDING: ru.cabinet.statusPending,
  APPROVED: ru.cabinet.statusApproved,
  REJECTED: ru.cabinet.statusRejected,
} as const;

export default async function CabinetPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  // Клиент → его кабинет (аудит P0: раньше попадал в пустой кабинет фотографа)
  if (session.role === 'CLIENT') redirect('/ru/cabinet/client');

  const profile =
    session.role === 'PHOTOGRAPHER'
      ? await db.photographerProfile.findUnique({ where: { userId: session.userId } })
      : null;

  const inquiries =
    profile?.status === 'APPROVED' ? await inquiriesForPhotographer(session.userId) : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{ru.cabinet.title}</h1>

      {session.role === 'PHOTOGRAPHER' && (
        <section className="mt-4 rounded-xl border p-4">
          <p className="text-sm opacity-60">{ru.cabinet.statusLabel}</p>
          {profile ? (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className="font-medium">{STATUS_LABEL[profile.status]}</span>
              {profile.status === 'REJECTED' && profile.rejectReason && (
                <span className="text-sm text-red-600">{profile.rejectReason}</span>
              )}
              {profile.status === 'APPROVED' && (
                <Link href={`/ru/photographer/${profile.username}`} className="text-sm underline">
                  {ru.cabinet.viewProfile}
                </Link>
              )}
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-3">
              <span>{ru.cabinet.noProfile}</span>
              <Link href="/ru/onboarding" className="rounded-lg bg-foreground px-3 py-1 text-sm text-background">
                {ru.cabinet.fillProfile}
              </Link>
            </div>
          )}
        </section>
      )}

      {session.role === 'PHOTOGRAPHER' && (
        <section className="mt-6">
          <h2 className="text-lg font-medium">{ru.cabinet.inquiriesTitle}</h2>
          {profile?.status !== 'APPROVED' ? (
            <p className="mt-2 text-sm opacity-60">{ru.cabinet.inquiriesLocked}</p>
          ) : !inquiries || inquiries.length === 0 ? (
            <p className="mt-2 text-sm opacity-60">{ru.cabinet.inquiriesEmpty}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {inquiries.map((i) => (
                <li key={i.id} className="rounded-xl border p-4 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{i.contactName}</span>
                    <span className="opacity-60">
                      {cityNameRu(i.city.slug)}
                      {i.category ? ` · ${categoryNameRu(i.category.slug)}` : ''}
                    </span>
                  </div>
                  <p className="mt-1">{i.description}</p>
                  <p className="mt-2 opacity-70">
                    {i.eventDate && `${ru.cabinet.eventDate}: ${i.eventDate.toISOString().slice(0, 10)} · `}
                    {i.budgetMinor != null && `${ru.cabinet.budget}: ${formatRubMinor(i.budgetMinor)} · `}
                    {i.contactPhone ?? i.contactEmail ?? ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
