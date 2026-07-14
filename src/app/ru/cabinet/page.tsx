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
import { LogoutButton } from '@/components/LogoutButton';
import { TelegramLinkButton } from '@/components/TelegramLinkButton';

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

  const pendingCount =
    session.role === 'ADMIN'
      ? await db.photographerProfile.count({ where: { status: 'PENDING' } })
      : 0;

  const me = await db.user.findUnique({ where: { id: session.userId }, select: { tgUserId: true } });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-semibold sm:text-3xl">{ru.cabinet.title}</h1>

      {session.role === 'ADMIN' && (
        <section className="mt-4 card p-4">
          <p className="text-sm muted">{ru.cabinet.adminTitle}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="font-medium">{ru.cabinet.adminQueue(pendingCount)}</span>
            <Link href="/ru/admin/moderation" className="btn btn-accent px-3 py-1.5">
              {ru.cabinet.adminOpenQueue}
            </Link>
          </div>
        </section>
      )}

      {session.role === 'PHOTOGRAPHER' && (
        <section className="mt-4 card p-4">
          <p className="text-sm muted">{ru.cabinet.statusLabel}</p>
          {profile ? (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className="font-medium">{STATUS_LABEL[profile.status]}</span>
              {profile.status === 'REJECTED' && profile.rejectReason && (
                <span className="text-sm text-accent">{profile.rejectReason}</span>
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
              <Link href="/ru/onboarding" className="btn btn-accent px-3 py-1.5">
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
            <p className="mt-2 text-sm muted">{ru.cabinet.inquiriesLocked}</p>
          ) : !inquiries || inquiries.length === 0 ? (
            <p className="mt-2 text-sm muted">{ru.cabinet.inquiriesEmpty}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {inquiries.map((i) => (
                <li key={i.id} className="card p-4 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{i.contactName}</span>
                    <span className="opacity-60">
                      {cityNameRu(i.city.slug)}
                      {i.category ? ` · ${categoryNameRu(i.category.slug)}` : ''}
                    </span>
                  </div>
                  <p className="mt-1">{i.description}</p>
                  <p className="mt-2 muted">
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

      <section className="mt-6 card p-4">
        <p className="text-sm muted">{ru.tg.title}</p>
        <div className="mt-2">
          <TelegramLinkButton bound={Boolean(me?.tgUserId)} />
        </div>
      </section>

      {/* «Выйти» — на мобиле убрали из шапки, здесь единственная точка выхода */}
      <div className="mt-8 border-t border-line pt-5 sm:hidden">
        <LogoutButton />
      </div>
    </main>
  );
}
