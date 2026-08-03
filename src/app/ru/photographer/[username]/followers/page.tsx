import { cache } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { ru } from '@/i18n/ru';
import { followersOf } from '@/lib/follow-lists';
import { FollowList } from '@/components/FollowList';

// Публичный список подписчиков фотографа (паритет MyWed). Лезет в БД →
// force-dynamic (урок: static-страница с запросом падает на пререндере без DATABASE_URL).
export const dynamic = 'force-dynamic';

// Запрос дедуплицируется в пределах одного рендера (аудит 2026-08-01, P2).
// generateMetadata и сам компонент вызывают его независимо, а Prisma-вызовы
// Next не дедуплицирует (в отличие от fetch) — самая посещаемая страница
// платформы делала тяжёлый джойн ДВАЖДЫ на каждый заход. cache() из react
// уже применён так же к getSession (src/lib/auth.ts).
const findProfile = cache(async (username: string) => {
  return db.photographerProfile.findFirst({
    where: { username, status: 'APPROVED' },
    select: { userId: true, username: true, user: { select: { firstName: true, lastName: true } } },
  });
});

export async function generateMetadata(props: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await props.params;
  const profile = await findProfile(username);
  if (!profile) return {};
  return { title: `${ru.followList.followersTitle} — ${profile.user.firstName} ${profile.user.lastName}`,
    // Служебный список: самостоятельной ценности для поиска нет, а бюджет
    // обхода лучше потратить на анкеты и каталоги
    robots: { index: false, follow: true },
  };
}

export default async function FollowersPage(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params;
  const profile = await findProfile(username);
  if (!profile) notFound();

  const entries = await followersOf(profile.userId);
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-10">
      <Link href={`/ru/photographer/${profile.username}`} className="text-sm underline muted">
        ← {profile.user.firstName} {profile.user.lastName}
      </Link>
      <h1 className="t-h1 mt-3">{ru.followList.followersTitle}</h1>
      <FollowList entries={entries} />
    </main>
  );
}
