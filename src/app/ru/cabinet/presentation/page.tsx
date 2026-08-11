import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { tierOf } from '@/lib/subscription';
import { PDF_PHOTO_LIMIT } from '@/lib/pricing';
import { PageHeader } from '@/components/PageHeader';
import { ru } from '@/i18n/ru';
import { CabinetNav } from '@/components/CabinetNav';

export const metadata: Metadata = { title: ru.presentation.title };
export const dynamic = 'force-dynamic';

/**
 * Презентация портфолио одним файлом.
 *
 * Страница нужна не ради кнопки: автор должен понимать, что именно уйдёт
 * заказчику, до того как отправит файл от своего имени. Поэтому здесь сказано,
 * сколько кадров войдёт, откуда берутся контакты и что будет на последней
 * странице.
 */
export default async function PresentationPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  if (session.role !== 'PHOTOGRAPHER') redirect('/ru/cabinet');

  const [tier, profile] = await Promise.all([
    tierOf(session.userId),
    db.photographerProfile.findUnique({
      where: { userId: session.userId },
      select: { status: true, _count: { select: { photos: { where: { status: 'APPROVED' } } } } },
    }),
  ]);

  const approved = profile?.status === 'APPROVED';
  const photos = profile?._count.photos ?? 0;
  const limit = PDF_PHOTO_LIMIT[tier];
  const ready = approved && photos > 0;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-10">
      <div className="max-w-2xl w-full">
      <CabinetNav approved={approved} hasProfile={Boolean(profile)} />
      <PageHeader
        crumbs={[{ href: '/ru/cabinet', label: ru.cabinet.title }]}
        title={ru.presentation.title}
        lead={ru.presentation.lead}
      />

      <ul className="mt-6 grid gap-2 text-sm">
        {ru.presentation.contains.map((item) => (
          <li key={item} className="rounded-media border border-line bg-surface-2 px-4 py-3">{item}</li>
        ))}
      </ul>

      <p className="t-caption mt-4 muted">
        {ru.presentation.limitNote(Math.min(limit, photos), limit)}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {ready ? (
          <a href="/api/portfolio-pdf" download className="btn btn-primary">
            {ru.presentation.download}
          </a>
        ) : (
          <span className="t-small muted">
            {approved ? ru.presentation.needPhotos : ru.presentation.needApproval}
          </span>
        )}
        {tier !== 'ELITE' && (
          <Link href="/ru/pro" className="t-caption underline muted">
            {tier === 'FREE' ? ru.presentation.upsellFree : ru.presentation.upsellPrime}
          </Link>
        )}
      </div>

      <p className="t-caption mt-6 muted">{ru.presentation.privacy}</p>
      </div>
    </main>
  );
}
