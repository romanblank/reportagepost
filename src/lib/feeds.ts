import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';

// Ленты (модель MyWed): «лучшее недели/года» — алгоритмические (взвешенные
// лайки за окно, по МАТЕРИАЛИЗОВАННЫМ лайкам Like), «выбор редакции» — ручная.
// (Считаем по Like, а не переигрывая PHOTO_LIKE/UNLIKE из журнала: анлайк
// удаляет строку Like, поэтому анлайкнутые не в счёте. Переигрывание событий
// давало фото отрицательный score — анлайк в окне лайка вне окна — и роняло его
// несправедливо. Волна аудита №6.)

export interface FeedPhoto {
  photoId: string;
  storageKey: string;
  width: number;
  height: number;
  username: string;
  firstName: string;
  lastName: string;
  /** Демо-витрина: карточка обязана быть помечена «Пример» */
  isDemo: boolean;
  scoreMilli: number;
  avatarKey: string | null; // аватар автора (или инициалы)
  blurData: string | null; // LQIP-плейсхолдер (Photo.blurhash) — фон при загрузке
}

// Один include и одна сборка карточки на все ленты (аудит 2026-08-01, P2).
// Раньше этот 10-полевой объект был скопирован пять раз (в одной из копий поля
// шли в другом порядке и в одну строку). Добавление поля в ленту — скажем,
// alt или признак видео — почти гарантированно было бы забыто в паре мест, и
// лента поехала бы только на части вкладок.
const FEED_INCLUDE = {
  profile: {
    select: {
      username: true,
      avatarKey: true,
      proRank: true,
      // Признак демо доезжает до карточек лент: герой главной подписывал
      // выдуманного автора без пометки «Пример» (аудит 2026-08-16) — первый
      // экран платформы не имеет права врать первым
      isDemo: true,
      user: { select: { firstName: true, lastName: true } },
    },
  },
} as const;

type FeedRow = Prisma.PhotoGetPayload<{ include: typeof FEED_INCLUDE }>;

function toFeedPhoto(p: FeedRow, scoreMilli = 0): FeedPhoto {
  return {
    photoId: p.id,
    storageKey: p.storageKey,
    width: p.width,
    height: p.height,
    username: p.profile.username,
    firstName: p.profile.user.firstName,
    lastName: p.profile.user.lastName,
    isDemo: p.profile.isDemo,
    scoreMilli,
    avatarKey: p.profile.avatarKey,
    blurData: p.blurhash,
  };
}

async function bestOfWindow(sinceDays: number, limit: number): Promise<FeedPhoto[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const grouped = await db.like.groupBy({
    by: ['photoId'],
    where: { photoId: { not: null }, createdAt: { gte: since } },
    _sum: { weightMilli: true },
    // Сортировка и отсечение — в базе, а не в приложении. Иначе «лучшее за
    // год» означало перенос ВСЕХ сгруппированных лайков в память процесса;
    // рядом, в recommendedFeed, этот же класс проблемы уже был исправлен.
    orderBy: { _sum: { weightMilli: 'desc' } },
    take: limit,
  });

  const scores = new Map<string, number>();
  for (const g of grouped) {
    if (g.photoId) scores.set(g.photoId, g._sum.weightMilli ?? 0);
  }
  const top = [...scores.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (top.length === 0) return [];

  const photos = await db.photo.findMany({
    where: { id: { in: top.map(([id]) => id) }, status: 'APPROVED', profile: { status: 'APPROVED' } },
    include: FEED_INCLUDE,
  });
  const byId = new Map(photos.map((p) => [p.id, p]));

  return top
    .map(([photoId, scoreMilli]) => {
      const p = byId.get(photoId);
      return p ? toFeedPhoto(p, scoreMilli) : null;
    })
    .filter((x): x is FeedPhoto => x !== null);
}

export const bestOfWeek = (limit = 60) => bestOfWindow(7, limit);
export const bestOfYear = (limit = 100) => bestOfWindow(365, limit);

/** Свежее: фолбэк для пустых лент на малых данных (честно, без пустых страниц). */
export async function freshPhotos(limit = 60): Promise<FeedPhoto[]> {
  const photos = await db.photo.findMany({
    where: { status: 'APPROVED', profile: { status: 'APPROVED' } },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    include: FEED_INCLUDE,
  });
  return photos.map((p) => toFeedPhoto(p));
}

// «Находки редакции»: квота 80/20 — 80% слотов подписчикам (Active/Active+),
// 20% кураторским merit (любой уровень). Editorial НЕ становится pay-to-play:
// пятая часть всегда за качеством вне подписки. Недобор группы добираем другой
// (без пустых слотов). Порядок — по дате отметки редакции.
const EDITORS_SUB_SHARE = 0.8;

export async function editorsChoice(limit = 100): Promise<FeedPhoto[]> {
  const pool = await db.photo.findMany({
    where: { status: 'APPROVED', editorsChoiceAt: { not: null }, profile: { status: 'APPROVED' } },
    orderBy: { editorsChoiceAt: 'desc' },
    take: Math.max(limit * 4, 48), // запас под квоту
    include: FEED_INCLUDE,
  });

  const subscribed = pool.filter((p) => p.profile.proRank > 0);
  const curated = pool.filter((p) => p.profile.proRank === 0);
  const subQuota = Math.round(limit * EDITORS_SUB_SHARE);

  let picked = [...subscribed.slice(0, subQuota), ...curated.slice(0, limit - subQuota)];
  if (picked.length < limit) {
    const used = new Set(picked.map((p) => p.id));
    picked = [...picked, ...pool.filter((p) => !used.has(p.id)).slice(0, limit - picked.length)];
  }
  picked.sort((a, b) => (b.editorsChoiceAt?.getTime() ?? 0) - (a.editorsChoiceAt?.getTime() ?? 0));

  return picked.map((p) => toFeedPhoto(p));
}

/**
 * Лента подписок: свежие публикации фотографов, на которых подписан пользователь
 * (по событиям PHOTO_PUBLISH поверх Follow).
 */
export async function followingFeed(userId: string, limit = 60): Promise<FeedPhoto[]> {
  const follows = await db.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } });
  if (follows.length === 0) return [];

  const photos = await db.photo.findMany({
    where: {
      status: 'APPROVED',
      profile: { status: 'APPROVED', userId: { in: follows.map((f) => f.followeeId) } },
    },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    include: FEED_INCLUDE,
  });
  return photos.map((p) => toFeedPhoto(p));
}

/**
 * Рекомендательная лента: персонально по категориям, которые пользователь
 * лайкал, ранжирование взвешенными лайками за 30 дней. Фолбэк при малых
 * данных — «лучшее недели», затем «свежее» (честно, без пустых страниц).
 */
export async function recommendedFeed(userId: string, limit = 60): Promise<{ photos: FeedPhoto[]; personalized: boolean }> {
  // категории интереса — из фото, которые пользователь лайкал
  const liked = await db.like.findMany({
    where: { userId, photoId: { not: null } },
    select: { photo: { select: { categoryId: true } } },
    take: 200,
  });
  const catIds = [...new Set(liked.map((l) => l.photo?.categoryId).filter((x): x is string => Boolean(x)))];

  if (catIds.length > 0) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    // Идём ОТ СВЕЖИХ ЛАЙКОВ, а не от всех фото категории (аудит 2026-07-31, P1).
    // Раньше сначала вытягивались до 5000 id фото, потом по ним делался
    // groupBy с IN(5000) — тяжёлый запрос на КАЖДОЕ открытие ленты, растущий
    // вместе с каталогом, ради отбора всего 60 кадров. Теперь фильтр по
    // категории и статусу выражен через связь, а сортировка и отсечение
    // выполняются в БД (по индексу Like[createdAt]) — из базы приходит ровно
    // столько строк, сколько нужно.
    const grouped = await db.like.groupBy({
      by: ['photoId'],
      where: {
        createdAt: { gte: since },
        photo: { status: 'APPROVED', categoryId: { in: catIds }, profile: { status: 'APPROVED' } },
      },
      _sum: { weightMilli: true },
      orderBy: { _sum: { weightMilli: 'desc' } },
      take: limit,
    });
    const scores = new Map<string, number>();
    for (const g of grouped) {
      if (g.photoId) scores.set(g.photoId, g._sum.weightMilli ?? 0);
    }
    const topIds = [...scores.entries()].filter(([, s]) => s > 0).map(([id]) => id);
    if (topIds.length === 0) return fallbackFeed(limit);
    const candidates = await db.photo.findMany({
      where: { status: 'APPROVED', id: { in: topIds }, profile: { status: 'APPROVED' } },
      include: FEED_INCLUDE,
    });
    if (candidates.length > 0) {
      const photos = candidates
        .map((p) => toFeedPhoto(p, scores.get(p.id) ?? 0))
        .sort((a, b) => b.scoreMilli - a.scoreMilli)
        .slice(0, limit);
      return { photos, personalized: true };
    }
  }

  return fallbackFeed(limit);
}

async function fallbackFeed(limit: number): Promise<{ photos: FeedPhoto[]; personalized: boolean }> {
  const best = await bestOfWeek(limit);
  if (best.length > 0) return { photos: best, personalized: false };
  return { photos: await freshPhotos(limit), personalized: false };
}

/** Ручная отметка редакции (инструмент оператора). */
export async function toggleEditorsChoice(photoId: string): Promise<{ chosen: boolean }> {
  const photo = await db.photo.findUnique({
    where: { id: photoId },
    include: { profile: { select: { userId: true } } },
  });
  if (!photo || photo.status !== 'APPROVED') throw new DomainError('photo_not_found', 404);
  const chosen = !photo.editorsChoiceAt;
  await db.photo.update({
    where: { id: photoId },
    data: { editorsChoiceAt: chosen ? new Date() : null },
  });
  // Петля признания (deep-think Content P1): уведомить автора о попадании в «Выбор
  // редакции». Только при включении. Вторично — не роняем действие.
  if (chosen) {
    const { notifyInApp } = await import('@/lib/notifications');
    await notifyInApp(photo.profile.userId, 'notification.photo.editors_choice', { photoId }).catch(() => {});
  }
  return { chosen };
}
