import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { avatarUrl } from '@/lib/photos';
import { parseFaq } from '@/lib/faq';
import { RU_CITIES } from '@/lib/geo-data';
import { CATEGORIES } from '@/lib/category-data';
import { ru } from '@/i18n/ru';
import { storage } from '@/lib/storage';
import { videoLimit, videoSecondsLimit } from '@/lib/pricing';
import { tierOf } from '@/lib/subscription';
import { EditProfileForm } from './EditProfileForm';
import { VideoManager } from '@/components/VideoManager';
import { PageHeader } from '@/components/PageHeader';
import { CabinetNav } from '@/components/CabinetNav';

export const metadata: Metadata = { title: ru.editProfile.title };
export const dynamic = 'force-dynamic';

export default async function EditProfilePage() {
  const session = await getSession();
  if (!session) redirect('/ru/login');
  if (session.role !== 'PHOTOGRAPHER') redirect('/ru/cabinet');

  const profile = await db.photographerProfile.findUnique({
    where: { userId: session.userId },
    include: {
      packages: { orderBy: { sortOrder: 'asc' } },
      city: true,
      categories: true,
      videos: { orderBy: { sortOrder: 'asc' } },
      user: { select: { phone: true } },
    },
  });
  if (!profile) redirect('/ru/onboarding');

  const cities = RU_CITIES.map((c) => ({ slug: c.slug, name: c.nameRu })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const categories = CATEGORIES.map((c) => ({ slug: c.slug, name: c.nameRu }));
  const catSlugById = new Map(await db.category.findMany().then((cs) => cs.map((c) => [c.id, c.slug] as const)));
  // Сколько роликов и какой длительности доступно — зависит от уровня подписки
  const tier = await tierOf(session.userId);

  // Разделы, требующие одобренной анкеты, до одобрения не показываем:
  // ссылка, ведущая к «дождитесь проверки», — обещание, которое мы сами
  // не выполняем
  const navProfile = await db.photographerProfile.findUnique({
      where: { userId: session.userId },
      select: { status: true },
    });
  const navApproved = navProfile?.status === 'APPROVED';

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-10">
      <CabinetNav approved={navApproved} hasProfile={Boolean(navProfile)} />
      <PageHeader
        crumbs={[{ href: '/ru/cabinet', label: ru.cabinet.title }]}
        title={ru.editProfile.title}
      />
      <EditProfileForm
        cities={cities}
        categories={categories}
        avatar={profile.avatarKey ? avatarUrl(profile.avatarKey) : null}
        initial={{
          username: profile.username,
          citySlug: profile.city.slug,
          categorySlugs: profile.categories.map((c) => catSlugById.get(c.categoryId)).filter((s): s is string => Boolean(s)),
          bio: profile.bio ?? '',
          siteUrl: profile.siteUrl ?? '',
          whatsapp: profile.whatsapp ?? '',
          telegram: profile.telegram ? `@${profile.telegram}` : '',
          experienceYears: profile.experienceYears ?? null,
          equipment: profile.equipment ?? '',
          cameras: profile.cameras,
          lenses: profile.lenses,
          lighting: profile.lighting,
          teamInfo: profile.teamInfo ?? '',
          doesVideo: profile.doesVideo,
          showPhone: profile.showPhone,
          hasPhone: Boolean(profile.user.phone),
          showreelUrls: profile.showreelUrls,
          languages: profile.languages,
          faq: parseFaq(profile.faq),
          packages: profile.packages.map((p) => ({ hours: p.hours, priceRub: Math.round(p.priceMinor / 100) })),
        }}
      />

      <section className="mt-10 border-t border-line pt-8">
        <h2 className="t-h2">{ru.onboarding.videoUploadTitle}</h2>
        <VideoManager
          limit={videoLimit(tier)}
          tier={tier}
          maxSeconds={videoSecondsLimit(tier)}
          videos={profile.videos.map((v) => ({
            id: v.id,
            // Исходник не показываем даже автору: пока нет web-варианта, играть
            // нечего — вместо мёртвого плеера менеджер рисует статус обработки
            url: v.sdKey ? storage.publicUrl(v.sdKey) : null,
            poster: v.posterKey ? storage.publicUrl(v.posterKey) : null,
            title: v.title,
            status: v.status,
            processing: v.processing,
            failureReason: v.failureReason,
            durationSec: v.durationSec,
          }))}
        />
      </section>
    </main>
  );
}
