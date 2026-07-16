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
import { profileCompleteness } from '@/lib/profile-completeness';
import { ONBOARDING_PHOTOS_MIN } from '@/lib/photos-constants';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';

export const metadata: Metadata = { title: ru.cabinet.title };
export const dynamic = 'force-dynamic'; // всегда свежие заявки/статус

const STATUS_LABEL = {
  DRAFT: ru.cabinet.statusDraft,
  PENDING: ru.cabinet.statusPending,
  NEEDS_REVISION: ru.cabinet.statusRevision,
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
      ? await db.photographerProfile.findUnique({
          where: { userId: session.userId },
          include: { _count: { select: { photos: true, favoritedBy: true, reviews: true } } },
        })
      : null;

  const completeness = profile
    ? profileCompleteness({
        hasAvatar: Boolean(profile.avatarKey),
        bio: profile.bio,
        experienceYears: profile.experienceYears,
        equipment: profile.equipment,
        teamInfo: profile.teamInfo,
        hasContact: Boolean(profile.whatsapp || profile.telegram || profile.siteUrl),
        photosCount: profile._count.photos,
        minPhotos: ONBOARDING_PHOTOS_MIN,
      })
    : null;

  const inquiries =
    profile?.status === 'APPROVED' ? await inquiriesForPhotographer(session.userId) : null;

  const pendingCount =
    session.role === 'ADMIN'
      ? await db.photographerProfile.count({ where: { status: 'PENDING' } })
      : 0;

  const me = await db.user.findUnique({ where: { id: session.userId }, select: { tgUserId: true, firstName: true } });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="t-h2">{me?.firstName ? ru.cabinet.greeting(me.firstName) : ru.cabinet.title}</h1>

      {session.role === 'ADMIN' && (
        <section className="mt-4 card p-4">
          <p className="t-caption muted">{ru.cabinet.adminTitle}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="font-medium">{ru.cabinet.adminQueue(pendingCount)}</span>
            <Link href="/ru/admin/moderation" className="btn btn-accent px-3 py-1.5">
              {ru.cabinet.adminOpenQueue}
            </Link>
            <Link href="/ru/admin/invites" className="text-sm underline">
              {ru.adminInvites.title}
            </Link>
            <Link href="/ru/admin/audit" className="text-sm underline">
              {ru.adminAudit.title}
            </Link>
            <Link href="/ru/admin/photographers/new" className="btn btn-outline px-3 py-1.5">
              {ru.adminPhotographers.createTitle}
            </Link>
            <Link href="/ru/cabinet/settings" className="text-sm underline">
              {ru.cabinet.settingsLink}
            </Link>
          </div>
        </section>
      )}

      {session.role === 'PHOTOGRAPHER' && profile && (
        <>
          <section className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span
              className={`rounded-sm px-2.5 py-1 text-xs font-medium ${
                profile.status === 'APPROVED' ? 'bg-success-soft text-success' : 'bg-surface-2 muted'
              }`}
            >
              {STATUS_LABEL[profile.status]}
            </span>
            {profile.status === 'APPROVED' && (
              <Link href={`/ru/photographer/${profile.username}`} className="text-sm underline muted">
                {ru.cabinet.viewProfile} →
              </Link>
            )}
            {profile.status === 'REJECTED' && profile.rejectReason && (
              <span className="text-sm text-accent">{profile.rejectReason}</span>
            )}
            {profile.status === 'NEEDS_REVISION' && profile.revisionNote && (
              <span className="text-sm text-accent">{profile.revisionNote}</span>
            )}
          </section>

          <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { n: profile._count.photos, label: ru.cabinet.statPhotos },
              { n: profile._count.favoritedBy, label: ru.cabinet.statSaves },
              { n: profile._count.reviews, label: ru.cabinet.statReviews },
              { n: inquiries?.length ?? 0, label: ru.cabinet.statInquiries },
            ].map((s) => (
              <div key={s.label} className="card px-4 py-3">
                <div className="text-2xl font-semibold tabular-nums">{s.n}</div>
                <div className="mt-0.5 text-xs muted">{s.label}</div>
              </div>
            ))}
          </section>

          <section className="mt-6">
            <p className="t-caption muted">{ru.cabinet.manageTitle}</p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { href: '/ru/cabinet/profile/edit', title: ru.editProfile.title, desc: ru.cabinet.tileEditDesc },
                { href: '/ru/cabinet/portfolio', title: ru.cabinet.portfolioLink, desc: ru.cabinet.tilePortfolioDesc },
                ...(profile.status === 'APPROVED'
                  ? [{ href: '/ru/cabinet/availability', title: ru.cabinet.availabilityLink, desc: ru.cabinet.tileAvailabilityDesc }]
                  : []),
                { href: '/ru/cabinet/settings', title: ru.cabinet.settingsLink, desc: ru.cabinet.tileSettingsDesc },
              ].map((t) => (
                <Link key={t.href} href={t.href} className="card p-4 transition-colors hover:border-accent">
                  <div className="font-medium">{t.title}</div>
                  <div className="mt-0.5 text-sm muted">{t.desc}</div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      {session.role === 'PHOTOGRAPHER' && !profile && (
        <section className="mt-4 card p-5 text-center">
          <p className="font-medium">{ru.cabinet.noProfile}</p>
          <Link href="/ru/onboarding" className="btn btn-accent mt-3 px-4 py-2">
            {ru.cabinet.fillProfile}
          </Link>
        </section>
      )}

      {completeness && (
        <section className="mt-4 card p-4">
          {completeness.pct >= 100 ? (
            <p className="font-medium">{ru.cabinet.completenessDone}</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{ru.cabinet.completenessTitle(completeness.pct)}</p>
                <Link href="/ru/cabinet/profile/edit" className="text-sm underline">{ru.editProfile.title}</Link>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${completeness.pct}%` }} />
              </div>
              <p className="mt-3 text-sm muted">{ru.cabinet.completenessHint}</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {completeness.missing.map((k) => (
                  <li key={k} className="rounded-full bg-surface-2 px-3 py-1 text-xs">{ru.cabinet.completenessItem[k]}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {session.role === 'PHOTOGRAPHER' && (
        <section className="mt-6">
          <h2 className="t-h3">{ru.cabinet.inquiriesTitle}</h2>
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
        <p className="t-caption muted">{ru.tg.title}</p>
        <div className="mt-2">
          <TelegramLinkButton bound={Boolean(me?.tgUserId)} />
        </div>
      </section>

      {/* «Выйти» — на мобиле убрали из шапки, здесь единственная точка выхода */}
      <div className="mt-8 border-t border-line pt-5 sm:hidden">
        <LogoutButton />
      </div>

      <section className="mt-8 border-t border-line pt-5">
        <p className="text-sm font-medium">{ru.account.dangerTitle}</p>
        <div className="mt-2"><DeleteAccountButton /></div>
      </section>
    </main>
  );
}
