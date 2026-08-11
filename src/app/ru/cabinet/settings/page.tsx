import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { twoFactorStatus } from '@/lib/two-factor';
import { ru } from '@/i18n/ru';
import { AccountSettings } from '@/components/AccountSettings';
import { NotifyPrefs } from '@/components/NotifyPrefs';
import { TwoFactorManager } from '@/components/TwoFactorManager';
import { PageHeader } from '@/components/PageHeader';
import { CabinetNav } from '@/components/CabinetNav';

export const metadata: Metadata = { title: ru.settings.title };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');

  const [user, status] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: {
        firstName: true, lastName: true, email: true, passwordHash: true,
        notifyInquiriesEmail: true, notifyInquiriesTg: true, notifyForumEmail: true, tgUserId: true,
      },
    }),
    twoFactorStatus(session.userId),
  ]);

  // Разделы, требующие одобренной анкеты, до одобрения не показываем:
  // ссылка, ведущая к «дождитесь проверки», — обещание, которое мы сами
  // не выполняем
  const navProfile = await db.photographerProfile.findUnique({
      where: { userId: session.userId },
      select: { status: true },
    });
  const navApproved = navProfile?.status === 'APPROVED';

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
      <CabinetNav approved={navApproved} hasProfile={Boolean(navProfile)} />
      <PageHeader
        crumbs={[{ href: '/ru/cabinet', label: ru.cabinet.title }]}
        title={ru.cabinet.settingsLink}
      />
      <h1 className="t-h1 mt-3">{ru.settings.title}</h1>
      <p className="mt-1 text-sm muted">{ru.settings.securityLead}</p>

      <section className="mt-8">
        <p className="t-caption text-recognition">{ru.settings.sectionAccount}</p>
        <div className="mt-3 card p-5 sm:p-6">
          <AccountSettings initial={{
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            hasPassword: Boolean(user.passwordHash),
          }} />
        </div>
      </section>

      {/* Внешние уведомления (аудит P1): отключить поток писем было нечем */}
      <section className="mt-8">
        <NotifyPrefs
          initialEmail={user.notifyInquiriesEmail}
          initialTg={user.notifyInquiriesTg}
          initialForum={user.notifyForumEmail}
          hasTelegram={Boolean(user.tgUserId)}
        />
      </section>

      <section className="mt-8">
        <p className="t-caption text-recognition">{ru.settings.sectionSecurity}</p>
        <div className="mt-3 card p-5 sm:p-6">
          <TwoFactorManager initial={status} />
        </div>
      </section>
    </main>
  );
}
