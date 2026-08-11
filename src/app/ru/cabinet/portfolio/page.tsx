import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { ru } from '@/i18n/ru';
import { thumbVariantUrl } from '@/lib/photos';
import { PortfolioManager, type PortfolioPhoto } from '@/components/PortfolioManager';
import { PortfolioImport } from '@/components/PortfolioImport';
import { categoryNameRu } from '@/lib/category-data';
import { PageHeader } from '@/components/PageHeader';
import { CabinetNav } from '@/components/CabinetNav';

export const metadata: Metadata = { title: ru.portfolio.title };
export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  if (session.role !== 'PHOTOGRAPHER') redirect('/ru/cabinet');

  const profile = await db.photographerProfile.findUnique({
    where: { userId: session.userId },
    select: {
      id: true, status: true, coverPhotoId: true,
      categories: { include: { category: { select: { slug: true } } } },
    },
  });

  const photos = profile
    ? await db.photo.findMany({
        where: { profileId: profile.id },
        orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'desc' }],
        select: { id: true, storageKey: true, status: true },
      })
    : [];

  const items: PortfolioPhoto[] = photos.map((p) => ({
    id: p.id,
    thumb: thumbVariantUrl(p.storageKey),
    status: p.status as PortfolioPhoto['status'],
  }));

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
      <div className="max-w-3xl w-full">
      <CabinetNav approved={navApproved} hasProfile={Boolean(navProfile)} />
      <PageHeader
        crumbs={[{ href: '/ru/cabinet', label: ru.cabinet.title }]}
        title={ru.cabinet.portfolioLink}
      />
      <h1 className="t-h2 mt-3">{ru.portfolio.title}</h1>

      {!profile ? (
        <p className="mt-4 text-sm muted">{ru.cabinet.noProfile}</p>
      ) : items.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm muted">{ru.portfolio.empty}</p>
          <Link href="/ru/onboarding" className="btn btn-accent btn-sm mt-3">{ru.portfolio.addMore}</Link>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm muted">{ru.portfolio.lead}</p>
          <div className="mt-6">
            <PortfolioManager initialPhotos={items} initialCoverId={profile.coverPhotoId} />
          </div>
        </>
      )}

      {profile && profile.categories.length > 0 && (
        <section className="mt-10 border-t border-line pt-8">
          <h2 className="t-h2">{ru.importPortfolio.title}</h2>
          <div className="mt-4">
            <PortfolioImport
              categories={profile.categories.map((c) => ({
                slug: c.category.slug,
                name: categoryNameRu(c.category.slug),
              }))}
            />
          </div>
        </section>
      )}
      </div>
    </main>
  );
}
