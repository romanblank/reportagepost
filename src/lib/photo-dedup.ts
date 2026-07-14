import { db } from '@/lib/db';
import { hammingDistanceHex, NEAR_DUP_MAX } from '@/lib/phash';

export type DuplicateKind = 'own' | 'foreign';

export interface DuplicateHit {
  kind: DuplicateKind; // own — свой повторный кадр; foreign — совпал с ЧУЖИМ (возможная кража)
  photoId: string;
  distance: number;
}

/**
 * Ищет почти-дубликат загружаемого кадра среди уже существующих фото.
 * Считаем по phash с расстоянием Хэмминга. REJECTED-фото игнорируем.
 *
 * Масштаб (S6): линейный перебор всех phash — при большой базе заменить на
 * LSH/BK-tree. Сейчас база мала. Ограничиваем выборку разумным потолком, чтобы
 * не тащить всё разом (лучше пропустить дубль, чем положить загрузку).
 */
export async function findNearDuplicate(
  phash: string,
  uploaderProfileId: string,
  threshold = NEAR_DUP_MAX,
): Promise<DuplicateHit | null> {
  const candidates = await db.photo.findMany({
    where: { phash: { not: null }, status: { in: ['PENDING', 'APPROVED'] } },
    select: { id: true, profileId: true, phash: true },
    orderBy: { uploadedAt: 'desc' },
    take: 5000,
  });

  let best: DuplicateHit | null = null;
  for (const c of candidates) {
    if (!c.phash) continue;
    const distance = hammingDistanceHex(phash, c.phash);
    if (distance > threshold) continue;
    const kind: DuplicateKind = c.profileId === uploaderProfileId ? 'own' : 'foreign';
    // Чужое совпадение (кража) приоритетнее своего; иначе — ближайшее.
    if (!best || (kind === 'foreign' && best.kind === 'own') || distance < best.distance) {
      best = { kind, photoId: c.id, distance };
      if (kind === 'foreign' && distance === 0) break; // точная кража — дальше не ищем
    }
  }
  return best;
}
