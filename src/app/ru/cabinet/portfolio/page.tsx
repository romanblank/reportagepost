import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { ru } from '@/i18n/ru';
import { thumbVariantUrl } from '@/lib/photos';
import { PortfolioManager, type PortfolioPhoto } from '@/components/PortfolioManager';

export const metadata: Metadata = { title: ru.portfolio.title };
export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  if (session.role !== 'PHOTOGRAPHER') redirect('/ru/cabinet');

  const profile = await db.photographerProfile.findUnique({
    where: { userId: session.userId },
    select: { id: true, status: true, coverPhotoId: true },
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

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <Link href="/ru/cabinet" className="text-sm underline muted">← {ru.cabinet.title}</Link>
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
    </main>
  );
}
