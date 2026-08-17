import Link from 'next/link';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { verifyShootInvite } from '@/lib/shoot-invite';
import { ru } from '@/i18n/ru';
import { ConfirmInviteForm } from './ConfirmInviteForm';

export const dynamic = 'force-dynamic';

/**
 * Страница по ссылке-приглашению: прошлый заказчик подтверждает съёмку,
 * состоявшуюся до платформы. Гостю — вход/регистрация с возвратом сюда же:
 * подтверждение обязано быть привязано к аккаунту, иначе оно ничего не стоит.
 */
export default async function ConfirmShootPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await verifyShootInvite(token);
  const t = ru.shootInvite;

  if (!invite) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12">
        <div className="w-full max-w-xl">
          <h1 className="t-h2">{t.invalidTitle}</h1>
          <p className="mt-2 t-body muted">{t.invalidText}</p>
        </div>
      </main>
    );
  }

  const profile = await db.photographerProfile.findUnique({
    where: { id: invite.profileId },
    select: {
      status: true, username: true, userId: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });
  if (!profile || profile.status !== 'APPROVED') {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12">
        <div className="w-full max-w-xl">
          <h1 className="t-h2">{t.invalidTitle}</h1>
          <p className="mt-2 t-body muted">{t.invalidText}</p>
        </div>
      </main>
    );
  }

  const session = await getSession();
  const authorName = `${profile.user.firstName} ${profile.user.lastName}`.trim();
  const isOwner = session?.userId === profile.userId;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12">
      <div className="w-full max-w-xl">
        <p className="t-caption text-muted">{t.eyebrow}</p>
        <h1 className="mt-1 t-h2 text-balance">{t.title(authorName)}</h1>
        <p className="mt-3 t-body muted">{t.lead}</p>

        {isOwner ? (
          <p className="mt-6 t-small text-warning">{t.ownOwn}</p>
        ) : session ? (
          <ConfirmInviteForm token={token} authorUsername={profile.username} />
        ) : (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {/* Возврат сюда же после входа: человек не должен искать ссылку заново */}
            <Link
              href={`/ru/register?next=${encodeURIComponent(`/ru/confirm/${token}`)}`}
              className="btn btn-accent px-4 py-2"
            >
              {t.registerCta}
            </Link>
            <Link
              href={`/ru/login?next=${encodeURIComponent(`/ru/confirm/${token}`)}`}
              className="t-small underline muted"
            >
              {t.loginCta}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
