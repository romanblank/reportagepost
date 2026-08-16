import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { activeTier, ELITE_RANK, type Tier } from '@/lib/subscription';

// Каталог: одобренные фотографы города с фильтрами.
// Ранжирование: MERIT-first (ratingScore) — подписка лишь мягкий tiebreaker, не
// pay-for-position (разворот 2026-07-25: синергия, не классовость). Буст-видимость
// подписки — отдельной полкой «Открыты для новых заказов» (recommendedForCity).

export interface CatalogFilters {
  citySlug: string;
  categorySlug?: string;
  /** Потолок цены пакета (total, minor units). Семантика — как в matching (бюджет
   *  на событие), едина по проекту. Раньше поле трактовалось как ₽/час с хардкод-×24
   *  → неверная фильтрация; выправлено на честный total (аудит 2026-07-26). */
  maxPackagePriceMinor?: number;
  /** «Свободен на дату» (UTC-полночь): исключает занятых в этот день. */
  availableOn?: Date;
  /** Пагинация (аудит P1-1): страница на PAGE_SIZE карточек. */
  page?: number;
  /** Только видеографы (формат «Видео»). Фото снимают все — отдельного флага не нужно. */
  videoOnly?: boolean;
  /** Нижняя граница цены пакета: прототип v9 даёт диапазон, а не только потолок.
   *  Заказчик с бюджетом «от» отсекает совсем дешёвые предложения осознанно. */
  minPackagePriceMinor?: number;
  /** Только авторы с подтверждёнными обеими сторонами съёмками (фильтр доверия). */
  withShootsOnly?: boolean;
  /**
   * Порядок выдачи (прототип v9 даёт выбор сортировки).
   *
   * По умолчанию — merit: заслуги, и он же остаётся единственным «редакционным»
   * порядком. Остальные варианты — способ ЗАКАЗЧИКА посмотреть иначе (дешевле,
   * новее), а не способ автора купить место: подписка ни в одном из них не
   * участвует. Это прямо следует из антиклассизм-инварианта.
   */
  sort?: CatalogSort;
  /** Бренды камер (раздел «Техника» в прототипе). Пустой массив = без фильтра. */
  cameraBrands?: string[];
}

export type CatalogSort = 'merit' | 'priceAsc' | 'fresh';

/**
 * Сколько авторов в городе по каждому жанру — для счётчиков в фильтрах.
 *
 * Без чисел фильтр вслепую: человек выбирает жанр и попадает в пустую выдачу.
 * Считаем по тем же правилам, что и каталог (APPROVED + есть работа), иначе
 * счётчик обещал бы больше, чем показывает список.
 */
/** Сколько авторов города снимает на каждый бренд — счётчики фильтра «Техника». */
export async function brandCountsForCity(citySlug: string): Promise<Record<string, number>> {
  const rows = await db.photographerProfile.findMany({
    where: {
      status: 'APPROVED',
      city: { slug: citySlug },
      photos: { some: { status: 'APPROVED' } },
      cameraBrands: { isEmpty: false },
    },
    select: { cameraBrands: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) {
    for (const b of r.cameraBrands) out[b] = (out[b] ?? 0) + 1;
  }
  return out;
}

export async function categoryCountsForCity(citySlug: string): Promise<Record<string, number>> {
  const rows = await db.profileCategory.groupBy({
    by: ['categoryId'],
    where: {
      profile: {
        status: 'APPROVED',
        city: { slug: citySlug },
        photos: { some: { status: 'APPROVED' } },
      },
    },
    _count: true,
  });
  if (rows.length === 0) return {};
  const cats = await db.category.findMany({
    where: { id: { in: rows.map((r) => r.categoryId) } },
    select: { id: true, slug: true },
  });
  const slugById = new Map(cats.map((c) => [c.id, c.slug]));
  const out: Record<string, number> = {};
  for (const r of rows) {
    const slug = slugById.get(r.categoryId);
    if (slug) out[slug] = r._count;
  }
  return out;
}

export const CATALOG_PAGE_SIZE = 24;

export interface CatalogPage {
  cards: CatalogCard[];
  page: number;
  hasNext: boolean;
}

export interface CatalogCard {
  username: string;
  firstName: string;
  lastName: string;
  verified: boolean;
  /** Демо-профиль: за ним нет живого автора, и это видно на карточке. */
  isDemo: boolean;
  avatarKey: string | null;
  bio: string | null;
  categories: string[];
  minPackage: { hours: number; priceMinor: number; currency: string } | null;
  coverKey: string | null; // обложка каталога (выбранная или лучший кадр)
  /** Есть ли WebP рядом с JPEG: у кадров, загруженных до появления формата, его нет */
  coverHasWebp: boolean;
  photoKeys: string[]; // до 6 превью (запас под hover-полосу)
  recommendCount: number; // отзывы rating≥4 & verified — публичный положительный сигнал (не звезда)
  saveCount: number; // в избранном у заказчиков
  score: number;
  tier: Tier; // FREE/PRIME/ELITE — бейдж подписки (FREE не показывается)
  doesVideo: boolean; // снимает видео — бейдж «Фото · Видео» в каталоге
  // Подтверждённые обеими сторонами съёмки — публичный факт доверия на карточке
  // (прототип v9: бейдж «17 подтв.» поверх кадра). Заменяет звёздный рейтинг:
  // не оценка, а то, что реально состоялось.
  shootCount: number;
  returningCount: number; // заказчиков, снимавшихся повторно
}

export function completenessScore(input: {
  bio: string | null;
  siteUrl: string | null;
  whatsapp: string | null;
  telegram: string | null;
  packagesCount: number;
  photosCount: number;
  lastPublishedAt: Date | null;
  now?: Date;
}): number {
  let score = 0;
  if (input.bio && input.bio.length >= 80) score += 15;
  else if (input.bio) score += 7;
  if (input.siteUrl) score += 5;
  if (input.whatsapp || input.telegram) score += 10;
  score += Math.min(input.packagesCount, 3) * 5; // до 15
  score += Math.min(input.photosCount, 20) * 2; // до 40
  // Свежесть: до 15 баллов, линейно сгорают за 90 дней без публикаций
  if (input.lastPublishedAt) {
    const now = input.now ?? new Date();
    const days = (now.getTime() - input.lastPublishedAt.getTime()) / 86_400_000;
    // Кламп обоих концов: будущий publishedAt (clock skew) не должен превысить кап 15.
    score += Math.min(15, Math.max(0, Math.round(15 * (1 - days / 90))));
  }
  return score; // максимум 100
}

/**
 * Единая форма данных для карточек каталога.
 *
 * Именно `select`, а не `include`: последний тянет ВСЕ скалярные поля анкеты —
 * оборудование, объективы, свет, состав команды, FAQ, ссылки на шоурилы,
 * языки. Карточке из них не нужно ничего, а на странице их двадцать четыре, и
 * этот груз ездил между базой и приложением на каждый заход в каталог.
 */
const CATALOG_INCLUDE = {
  id: true,
  username: true,
  verified: true,
  isDemo: true,
  avatarKey: true,
  bio: true,
  coverPhotoId: true,
  ratingScore: true,
  proRank: true,
  doesVideo: true,
  user: { select: { firstName: true, lastName: true, subscription: true } },
  categories: { select: { category: { select: { slug: true } } } },
  // ДЕШЁВЫЙ пакет, а не первый введённый (аудит 2026-08-16): «от 45 000»
  // у автора, чей второй пакет стоит 8 000, завышал вход в пять раз и
  // прогонял заказчика с бюджетом
  packages: { select: { hours: true, priceMinor: true, currency: true }, orderBy: { priceMinor: 'asc' } },
  photos: {
    where: { status: 'APPROVED' as const },
    select: { id: true, storageKey: true, hasWebp: true },
    orderBy: { publishedAt: 'desc' as const },
    take: 6,
  },
  _count: { select: { favoritedBy: true } },
} satisfies Prisma.PhotographerProfileSelect;

type CatalogRow = Prisma.PhotographerProfileGetPayload<{ select: typeof CATALOG_INCLUDE }>;

// Строки профилей → карточки (+ агрегат отзывов одним запросом). Общая сборка
// для основного списка и полки «Открыты для новых заказов».
async function toCards(shown: CatalogRow[]): Promise<CatalogCard[]> {
  // Публичный положительный сигнал вместо среднего 1–5: число рекомендаций
  // (отзывы rating≥4 & verified & VISIBLE). Низкие оценки в публичный сигнал не идут.
  const recAgg = shown.length
    ? await db.review.groupBy({
        by: ['profileId'],
        where: { profileId: { in: shown.map((p) => p.id) }, status: 'VISIBLE', rating: { gte: 4 }, verified: true },
        _count: true,
      })
    : [];
  const recMap = new Map(recAgg.map((r) => [r.profileId, r._count]));

  // Подтверждённые съёмки и вернувшиеся заказчики — одним запросом на страницу
  const shootRows = shown.length
    ? await db.shootConfirmation.groupBy({
        by: ['profileId', 'clientUserId'],
        // Только проверенные подтверждения: бейдж «N подтв.» — публичный
        // сигнал доверия, и цепочка свежих аккаунтов его давать не должна
        where: { profileId: { in: shown.map((p) => p.id) }, state: 'CONFIRMED', needsReview: false },
        _count: true,
      })
    : [];
  const shootMap = new Map<string, { total: number; returning: number }>();
  for (const r of shootRows) {
    const cur = shootMap.get(r.profileId) ?? { total: 0, returning: 0 };
    cur.total += r._count;
    if (r._count >= 2) cur.returning += 1;
    shootMap.set(r.profileId, cur);
  }

  // Обложки догружаем ЯВНО (аудит 2026-08-01, P2). Раньше выбранная автором
  // обложка искалась внутри уже усечённых 6 самых свежих кадров: у активно
  // публикующего автора она туда не попадала, find молча не находил её и
  // срабатывал фолбэк на последний кадр. Инструмент «выбрать обложку» переставал
  // работать без единого сигнала — именно у самых деятельных участников беты.
  // Запрашиваем только те обложки, которых нет в загруженной выборке.
  const missingCoverIds = shown
    .map((p) => p.coverPhotoId)
    .filter((id): id is string => Boolean(id))
    .filter((id) => !shown.some((p) => p.photos.some((ph) => ph.id === id)));
  const extraCovers = missingCoverIds.length
    ? await db.photo.findMany({
        // Обложка должна оставаться опубликованной: снятая с публикации не
        // может подменять карточку в каталоге
        where: { id: { in: missingCoverIds }, status: 'APPROVED' },
        select: { id: true, storageKey: true, hasWebp: true },
      })
    : [];
  const coverMap = new Map(extraCovers.map((c) => [c.id, c.storageKey]));

  return shown.map((p) => ({
    username: p.username,
    verified: p.verified,
    isDemo: p.isDemo,
    avatarKey: p.avatarKey,
    firstName: p.user.firstName,
    lastName: p.user.lastName,
    bio: p.bio,
    categories: p.categories.map((c) => c.category.slug),
    // Цена видна у ВСЕХ авторов (решение 2026-08-04).
    //
    // Прежде она скрывалась у бесплатных — и это оказалось геткипингом жёстче
    // того самого ранжирования, которое инвариант запрещает: заказчик,
    // сравнивающий по бюджету, бесплатного автора просто не видел в
    // сравнении, а фильтр цены его отбрасывал. То есть видимость всё-таки
    // продавалась — способом, который бьёт по заказчику и которого мы себе не
    // признавали. Перком подписки остаётся НАБОР пакетов на странице автора
    // (несколько вариантов, состав, условия), а базовая цена «от» — общая
    // информация, без которой каталог бесполезен.
    minPackage: p.packages[0]
      ? { hours: p.packages[0].hours, priceMinor: p.packages[0].priceMinor, currency: p.packages[0].currency }
      : null,
    coverKey:
      (p.coverPhotoId &&
        (p.photos.find((ph) => ph.id === p.coverPhotoId)?.storageKey ?? coverMap.get(p.coverPhotoId))) ||
      p.photos[0]?.storageKey ||
      null,
    coverHasWebp:
      (p.coverPhotoId ? p.photos.find((ph) => ph.id === p.coverPhotoId)?.hasWebp : p.photos[0]?.hasWebp) ?? false,
    photoKeys: p.photos.map((ph) => ph.storageKey),
    recommendCount: recMap.get(p.id) ?? 0,
    saveCount: p._count.favoritedBy,
    score: p.ratingScore,
    tier: activeTier(p.user.subscription),
    doesVideo: p.doesVideo,
    shootCount: shootMap.get(p.id)?.total ?? 0,
    returningCount: shootMap.get(p.id)?.returning ?? 0,
  } satisfies CatalogCard));
}

export async function catalogForCity(filters: CatalogFilters): Promise<CatalogPage> {
  const page = Math.max(1, filters.page ?? 1);

  const where = {
    status: 'APPROVED' as const,
    city: { slug: filters.citySlug },
    // Планка качества: в выдачу — только авторы с готовой работой (пустая карточка
    // без портфолио бьёт по первому впечатлению). Ниже — та же гарантия для полки.
    photos: { some: { status: 'APPROVED' as const } },
    ...(filters.categorySlug
      ? { categories: { some: { category: { slug: filters.categorySlug } } } }
      : {}),
    ...(filters.availableOn ? { busyDates: { none: { date: filters.availableOn } } } : {}),
    // Диапазон цены: обе границы должны выполняться на ОДНОМ пакете, иначе
    // автор с дешёвым часом и дорогой сменой пройдёт фильтр по ошибке.
    ...(filters.maxPackagePriceMinor != null || filters.minPackagePriceMinor != null
      ? {
          packages: {
            some: {
              ...(filters.maxPackagePriceMinor != null ? { priceMinor: { lte: filters.maxPackagePriceMinor } } : {}),
              ...(filters.minPackagePriceMinor != null
                ? { priceMinor: { gte: filters.minPackagePriceMinor, ...(filters.maxPackagePriceMinor != null ? { lte: filters.maxPackagePriceMinor } : {}) } }
                : {}),
            },
          },
        }
      : {}),
    ...(filters.videoOnly ? { doesVideo: true } : {}),
    // Фильтр доверия: только те, у кого есть подтверждённая обеими сторонами
    // съёмка. Самоотметки заказчика недостаточно (S4 trust-хардеринг).
    ...(filters.withShootsOnly
      ? { shootConfirmations: { some: { state: 'CONFIRMED' as const, needsReview: false } } }
      : {}),
    ...(filters.cameraBrands?.length ? { cameraBrands: { hasSome: filters.cameraBrands } } : {}),
  };

  // MERIT-ONLY: порядок основной выдачи НЕ зависит от подписки (антиклассизм-
  // инвариант). proRank убран — он давал платным верх при равном ratingScore
  // (а на молодом каталоге он у всех ≈ равен). Буст подписки живёт ТОЛЬКО в
  // отдельной полке recommendedForCity. Tiebreaker — детерминированный id
  // (стабильная пагинация; не деньги). Ротацию равного merit — отдельным пунктом.
  //
  // Страница КАТЕГОРИИ (рейтинг v2, категория×город): сортировка по ЖАНРОВОМУ
  // скору (ProfileCategoryScore — engagement лайков фото этого жанра + общая
  // база) — специалист жанра выше генералиста с равным глобальным ratingScore.
  // Запрос идёт от таблицы скоров (профиль без строки скора = не пересчитан,
  // бэкфилл в сиде гарантирует покрытие). Город без категории — по ratingScore.
  if (filters.categorySlug) {
    const scoreRows = await db.profileCategoryScore.findMany({
      where: { category: { slug: filters.categorySlug }, profile: where },
      orderBy: [{ scoreMilli: 'desc' }, { profileId: 'asc' }],
      skip: (page - 1) * CATALOG_PAGE_SIZE,
      take: CATALOG_PAGE_SIZE + 1, // +1 для hasNext
      include: { profile: { select: CATALOG_INCLUDE } },
    });
    const hasNext = scoreRows.length > CATALOG_PAGE_SIZE;
    const cards = await toCards(scoreRows.slice(0, CATALOG_PAGE_SIZE).map((r) => r.profile));
    return { cards, page, hasNext };
  }

  // Порядок: merit по умолчанию; «сначала недорогие» и «новые авторы» — выбор
  // заказчика. Tiebreaker всегда id — пагинация обязана быть стабильной.
  //
  // Цена сортируется В БАЗЕ по денормализованному minPriceMinor (аудит
  // 2026-08-16): прежняя сортировка страницы в приложении давала не «дешёвые
  // первыми по городу», а «страница merit-порядка, перетасованная по цене» —
  // дешёвый автор с 30-го места merit не попадал на первую страницу дешёвых
  // никогда. Комментарий-обоснование той версии («цена только у подписчиков»)
  // устарел ещё 2026-08-04, когда цену открыли всем. Авторы без пакетов — в
  // конце: сравнить их по этому признаку нельзя.
  const orderBy =
    filters.sort === 'fresh'
      ? [{ createdAt: 'desc' as const }, { id: 'asc' as const }]
      : filters.sort === 'priceAsc'
        ? [
            { minPriceMinor: { sort: 'asc' as const, nulls: 'last' as const } },
            { ratingScore: 'desc' as const },
            { id: 'asc' as const },
          ]
        : [{ ratingScore: 'desc' as const }, { id: 'asc' as const }];

  const rows = await db.photographerProfile.findMany({
    where,
    orderBy,
    skip: (page - 1) * CATALOG_PAGE_SIZE,
    take: CATALOG_PAGE_SIZE + 1, // +1 для hasNext
    select: CATALOG_INCLUDE,
  });

  const hasNext = rows.length > CATALOG_PAGE_SIZE;
  const cards = await toCards(rows.slice(0, CATALOG_PAGE_SIZE));

  return { cards, page, hasNext };
}

// «Открыты для новых заказов»: полка — перк ТОЛЬКО Active+ (ELITE). Буст-видимость
// БЕЗ сдвига основного merit-списка (soft-hybrid). proRank>=ELITE_RANK — префильтр,
// точный статус — по activeTier (денорм может отставать от экспирации).
export async function recommendedForCity(citySlug: string, limit = 6): Promise<CatalogCard[]> {
  const rows = await db.photographerProfile.findMany({
    where: { status: 'APPROVED', city: { slug: citySlug }, proRank: { gte: ELITE_RANK }, photos: { some: { status: 'APPROVED' } } },
    orderBy: [{ ratingScore: 'desc' }, { id: 'asc' }],
    take: limit * 2, // запас под фильтр активных
    select: CATALOG_INCLUDE,
  });
  const active = rows.filter((p) => activeTier(p.user.subscription) === 'ELITE').slice(0, limit);
  return toCards(active);
}
