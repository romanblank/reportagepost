import { Prisma } from '@prisma/client';
import { brandsFromCameras } from '@/lib/gear-brands';
import { resolveCity } from '@/lib/geo-resolve';
import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { parseShowreel } from '@/lib/showreel';

// Схема и применение правки анкеты. Общее для self-роута (фотограф правит свою)
// и админ-роута (оператор правит анкету заведённого фотографа). Всё, что после
// zod-парсинга — здесь, чтобы логика не расходилась между двумя точками входа.
export const ProfileEditSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,29}$/).optional(),
  citySlug: z.string().trim().optional(),
  categorySlugs: z.array(z.string().trim()).min(1).max(3).optional(),
  bio: z.string().trim().max(2000).optional(),
  // Только http/https — zod .url() пропускает javascript:/data: (stored XSS в href).
  siteUrl: z.string().trim().url().max(200).refine((u) => /^https?:\/\//i.test(u), 'только http(s)').optional().or(z.literal('')),
  whatsapp: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'E.164').optional().or(z.literal('')),
  // Реквизиты для документов, которые автор скачивает себе. Публично не
  // показываются нигде: они существуют, чтобы не вбивать их в каждый файл.
  legalName: z.string().trim().max(200).optional().or(z.literal('')),
  inn: z.string().trim().regex(/^\d{10}$|^\d{12}$/, 'ИНН — 10 или 12 цифр').optional().or(z.literal('')),
  bankAccount: z.string().trim().regex(/^\d{20}$/, 'счёт — 20 цифр').optional().or(z.literal('')),
  bankName: z.string().trim().max(200).optional().or(z.literal('')),
  bic: z.string().trim().regex(/^\d{9}$/, 'БИК — 9 цифр').optional().or(z.literal('')),
  telegram: z.string().trim().regex(/^@?[A-Za-z0-9_]{5,32}$/).optional().or(z.literal('')),
  experienceYears: z.number().int().min(0).max(70).nullable().optional(),
  equipment: z.string().trim().max(500).optional(),
  cameras: z.array(z.string().trim().min(1).max(80)).max(24).optional(),
  lenses: z.array(z.string().trim().min(1).max(80)).max(24).optional(),
  lighting: z.array(z.string().trim().min(1).max(80)).max(24).optional(),
  teamInfo: z.string().trim().max(300).optional(),
  doesVideo: z.boolean().optional(),
  showPhone: z.boolean().optional(), // «Показать номер» — явный опт-ин
  showreelUrls: z.array(z.string().trim().min(1).max(300)).max(6).optional(),
  languages: z.array(z.string().trim().regex(/^[a-z]{2}$/)).max(8).optional(),
  faq: z
    .array(z.object({ q: z.string().trim().min(1).max(200), a: z.string().trim().min(1).max(1000) }))
    .max(10)
    .optional(),
  packages: z
    .array(z.object({ hours: z.number().int().min(1).max(24), priceMinor: z.number().int().min(1), currency: z.literal('RUB') }))
    .min(1)
    .max(6)
    .optional(),
});

export type ProfileEditInput = z.infer<typeof ProfileEditSchema>;

export async function applyProfileEdit(
  profileId: string,
  currentUsername: string,
  d: ProfileEditInput,
): Promise<{ username: string }> {
  // siteUrl: только http(s) (guard от javascript:/data:)
  const site = d.siteUrl?.trim();
  if (site && !/^https?:\/\//i.test(site)) throw new DomainError('validation', 400);

  // Публичные тексты анкеты после одобрения меняются БЕЗ повторной модерации
  // анкеты — но не без модерации вообще (аудит 2026-08-16): иначе автор
  // проходит проверку с чистым bio, а потом дописывает в него что угодно.
  // Уровень — модель+guard, БЕЗ программных антиконтактных правил форума:
  // сайт и контакты в анкете легитимны (это её поля), а вот оскорбления и
  // спам — нет. Без ключа модели вердикта не будет — как и в комментариях,
  // это осознанная деградация, а не тихий провал.
  const publicText = [
    d.bio,
    d.teamInfo,
    d.equipment,
    ...(d.faq ?? []).flatMap((f) => [f.q, f.a]),
  ]
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .join('\n');
  if (publicText.length > 0) {
    const { modelVerdict } = await import('@/lib/text-moderation');
    const verdict = await modelVerdict(publicText);
    if (verdict?.action === 'reject') {
      throw new DomainError(`profile_text_${verdict.reason}`, 400);
    }
  }

  let newUsername: string | undefined;
  if (d.username && d.username !== currentUsername) {
    // Предварительная проверка — быстрый и понятный отказ, но НЕ гарантия:
    // между ней и записью имя может занять параллельный запрос. Настоящая
    // защита — уникальный индекс, и его нарушение ловится ниже как 409
    // (аудит 2026-08-01, P2: раньше гонка давала 500).
    const taken = await db.photographerProfile.findUnique({ where: { username: d.username } });
    if (taken) throw new DomainError('username_taken', 409);
    newUsername = d.username;
  }
  let newCityId: string | undefined;
  if (d.citySlug) {
    const city = await resolveCity(d.citySlug);
    if (!city) throw new DomainError('city_not_found', 400);
    newCityId = city.id;
  }
  let newCategoryIds: string[] | undefined;
  if (d.categorySlugs) {
    const cats = await db.category.findMany({ where: { slug: { in: d.categorySlugs }, active: true } });
    if (cats.length !== d.categorySlugs.length) throw new DomainError('category_not_found', 400);
    newCategoryIds = cats.map((c) => c.id);
  }

  try {
    await db.$transaction(async (tx) => {
      if (newUsername) {
        // Старый адрес сохраняем — по нему пойдёт редирект на новый профиль.
        // Прежние ссылки (мессенджеры, соцсети, визитки, выдача) продолжают
        // работать: для платформы, где профиль и есть продукт автора, молча
        // ломать их — потеря аудитории на ровном месте.
        await tx.usernameHistory.deleteMany({ where: { username: newUsername } });
        await tx.usernameHistory.upsert({
          where: { username: currentUsername },
          create: { username: currentUsername, profileId },
          update: { profileId, changedAt: new Date() },
        });
      }
      await tx.photographerProfile.update({
        where: { id: profileId },
        data: {
          ...(newUsername ? { username: newUsername } : {}),
          ...(newCityId ? { cityId: newCityId } : {}),
          bio: d.bio?.trim() || null,
          siteUrl: site || null,
          legalName: d.legalName?.trim() || null,
          inn: d.inn?.trim() || null,
          bankAccount: d.bankAccount?.trim() || null,
          bankName: d.bankName?.trim() || null,
          bic: d.bic?.trim() || null,
          whatsapp: d.whatsapp?.trim() || null,
          telegram: d.telegram?.trim().replace(/^@/, '') || null,
          experienceYears: d.experienceYears ?? null,
          ...(d.equipment !== undefined ? { equipment: d.equipment.trim() || null } : {}),
          ...(d.cameras !== undefined
          ? {
              cameras: d.cameras,
              // Бренды пересчитываем здесь же: иначе фильтр каталога начнёт
              // расходиться с тем, что автор написал в анкете
              cameraBrands: brandsFromCameras(d.cameras),
            }
          : {}),
          ...(d.lenses !== undefined ? { lenses: d.lenses } : {}),
          ...(d.lighting !== undefined ? { lighting: d.lighting } : {}),
          teamInfo: d.teamInfo?.trim() || null,
          ...(d.doesVideo !== undefined ? { doesVideo: d.doesVideo } : {}),
          ...(d.showPhone !== undefined ? { showPhone: d.showPhone } : {}),
          // Сохраняем только ссылки, парсящиеся в известного провайдера (чистое хранилище).
          ...(d.showreelUrls !== undefined
            ? { showreelUrls: d.showreelUrls.filter((u) => parseShowreel(u) !== null) }
            : {}),
          ...(d.languages && d.languages.length ? { languages: d.languages } : {}),
          ...(d.faq !== undefined
            ? { faq: d.faq.length ? (d.faq as unknown as Prisma.InputJsonValue) : Prisma.DbNull }
            : {}),
        },
      });
      if (newCategoryIds) {
        await tx.profileCategory.deleteMany({ where: { profileId } });
        await tx.profileCategory.createMany({ data: newCategoryIds.map((categoryId) => ({ profileId, categoryId })) });
      }
      if (d.packages) {
        await tx.pricePackage.deleteMany({ where: { profileId } });
        await tx.pricePackage.createMany({
          data: d.packages.map((p, i) => ({ profileId, hours: p.hours, priceMinor: p.priceMinor, currency: p.currency, sortOrder: i })),
        });
        // Денормализованный минимум — в ТОЙ ЖЕ транзакции, что и пакеты:
        // на нём держится сортировка «сначала недорогие» и «от <цена>» карточки
        await tx.photographerProfile.update({
          where: { id: profileId },
          data: { minPriceMinor: d.packages.length ? Math.min(...d.packages.map((p) => p.priceMinor)) : null },
        });
      }
    });
  } catch (e) {
    // Гонка на уникальном индексе: имя заняли между проверкой и записью.
    // Без этого разбора клиент получал 500 вместо понятного «имя занято».
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new DomainError('username_taken', 409);
    }
    throw e;
  }

  // Пересчёт скоров ПОСЛЕ правки (ревью 2026-07-31, P1): смена категорий без
  // пересчёта оставляла новый жанр без строки ProfileCategoryScore — профиль
  // невидим в выдаче этого жанра (категорийная ветка каталога идёт от таблицы
  // скоров). Пакеты/био двигают полноту → пересчитываем на любой правке.
  const { recomputeOne } = await import('@/lib/rating');
  await recomputeOne(profileId);

  return { username: newUsername ?? currentUsername };
}
