import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { tierOf } from '@/lib/subscription';
import { DOC_MIN_TIER, type SalesDocKind } from '@/lib/sales-kit';
import { PageHeader } from '@/components/PageHeader';
import { ru } from '@/i18n/ru';
import { CabinetNav } from '@/components/CabinetNav';

export const metadata: Metadata = { title: ru.salesKit.title };
export const dynamic = 'force-dynamic';

const ORDER: SalesDocKind[] = ['brief', 'checklist', 'proposal', 'contract', 'invoice', 'act'];
const TIER_ORDER = { FREE: 0, PRIME: 1, ELITE: 2 } as const;

/**
 * Документы для работы с юрлицами.
 *
 * Никаких заявок и согласований: нажал — скачал. Это принципиально, а не
 * удобно: менеджеров у платформы нет, и продукт, требующий человека на нашей
 * стороне, просто не будет работать.
 */
export default async function SalesKitPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  if (session.role !== 'PHOTOGRAPHER') redirect('/ru/cabinet');

  const [tier, profile] = await Promise.all([
    tierOf(session.userId),
    db.photographerProfile.findUnique({
      where: { userId: session.userId },
      select: { legalName: true, inn: true, bankAccount: true },
    }),
  ]);
  const hasRequisites = Boolean(profile?.legalName && profile?.inn && profile?.bankAccount);

  // Разделы, требующие одобренной анкеты, до одобрения не показываем:
  // ссылка, ведущая к «дождитесь проверки», — обещание, которое мы сами
  // не выполняем
  const navProfile = await db.photographerProfile.findUnique({
      where: { userId: session.userId },
      select: { status: true },
    });
  const navApproved = navProfile?.status === 'APPROVED';

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-10">
      <div className="max-w-2xl w-full">
      <CabinetNav approved={navApproved} hasProfile={Boolean(navProfile)} />
      <PageHeader
        crumbs={[{ href: '/ru/cabinet', label: ru.cabinet.title }]}
        title={ru.salesKit.title}
        lead={ru.salesKit.lead}
      />

      <ul className="mt-6 grid gap-2">
        {ORDER.map((kind) => {
          const available = TIER_ORDER[tier] >= TIER_ORDER[DOC_MIN_TIER[kind]];
          return (
            <li key={kind}
              className="flex flex-wrap items-center justify-between gap-3 rounded-media border border-line bg-surface-2 px-4 py-3">
              <span className="min-w-0">
                <span className="t-small block">{ru.salesKit.docs[kind]}</span>
                <span className="t-caption muted">{ru.salesKit.hints[kind]}</span>
              </span>
              {available ? (
                <a href={`/api/sales-kit/${kind}`} download className="btn btn-outline btn-sm shrink-0">
                  {ru.salesKit.download}
                </a>
              ) : (
                <Link href="/ru/pro" className="t-caption shrink-0 underline muted">
                  {ru.salesKit.needTier[DOC_MIN_TIER[kind]]}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {/* Реквизиты нужны только для счёта и акта — и только самому автору */}
      <section className="mt-8 border-t border-line pt-6">
        <h2 className="t-title">{ru.salesKit.requisitesTitle}</h2>
        <p className="mt-1 t-small muted">
          {hasRequisites ? ru.salesKit.requisitesFilled : ru.salesKit.requisitesEmpty}
        </p>
        <Link href="/ru/cabinet/profile/edit#requisites" className="btn btn-outline btn-sm mt-3">
          {ru.salesKit.requisitesCta}
        </Link>
      </section>

      <p className="mt-8 t-fine muted">{ru.salesKit.disclaimer}</p>
      </div>
    </main>
  );
}
