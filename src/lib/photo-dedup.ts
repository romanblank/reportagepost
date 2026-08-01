import { db } from '@/lib/db';
import { NEAR_DUP_MAX } from '@/lib/phash';

export type DuplicateKind = 'own' | 'foreign';

export interface DuplicateHit {
  kind: DuplicateKind; // own — свой повторный кадр; foreign — совпал с ЧУЖИМ (возможная кража)
  photoId: string;
  distance: number;
}

interface RawHit {
  id: string;
  profileId: string;
  distance: number;
}

/**
 * Ищет почти-дубликат загружаемого кадра среди уже существующих фото.
 * Расстояние Хэмминга по phash считается В БАЗЕ, полным сравнением.
 *
 * Раньше здесь вытягивались последние 5000 фото и расстояние считалось в JS
 * (аудит 2026-08-01, P2). У этого потолка было тихое последствие: при 100 000
 * кадров окно покрывало 5% базы — и кража чужого портфолио переставала
 * детектироваться. Без единой ошибки в логах, то есть оператор был бы уверен,
 * что защита работает. Молчаливая деградация trust-механики опаснее отказа.
 *
 * Postgres умеет XOR и подсчёт единиц по bit(64) — hex-phash приводится
 * выражением ('x'||phash)::bit(64). Сравнение идёт по всей таблице, но без
 * передачи строк в приложение: из базы возвращается ровно один кандидат.
 * Полнота больше не зависит от размера базы.
 *
 * При росте до миллионов кадров следующий шаг — LSH по префиксным блокам
 * (несколько колонок по 8-16 бит + точное совпадение любой из них как
 * предфильтр). Делать это сейчас преждевременно: seq scan с XOR на текущих и
 * ближайших объёмах дешевле, чем поддержка индексной структуры.
 */
export async function findNearDuplicate(
  phash: string,
  uploaderProfileId: string,
  threshold = NEAR_DUP_MAX,
): Promise<DuplicateHit | null> {
  // Guard: в SQL уходит только то, что прошло проверку формата — hex ровно
  // 16 символов. Значение всё равно параметризовано, но пусть некорректный
  // ввод отваливается здесь, а не превращается в ошибку приведения типа.
  if (!/^[0-9a-f]{16}$/i.test(phash)) return null;

  const rows = await db.$queryRaw<RawHit[]>`
    SELECT id, "profileId",
           bit_count(('x' || "phash")::bit(64) # ('x' || ${phash})::bit(64))::int AS distance
    FROM "Photo"
    WHERE "phash" IS NOT NULL
      AND "status" IN ('PENDING', 'APPROVED')
      AND bit_count(('x' || "phash")::bit(64) # ('x' || ${phash})::bit(64)) <= ${threshold}
    -- Чужое совпадение (возможная кража) важнее своего повтора, дальше — ближайшее
    ORDER BY ("profileId" <> ${uploaderProfileId}) DESC, distance ASC
    LIMIT 1
  `;

  const hit = rows[0];
  if (!hit) return null;
  return {
    kind: hit.profileId === uploaderProfileId ? 'own' : 'foreign',
    photoId: hit.id,
    distance: Number(hit.distance),
  };
}
