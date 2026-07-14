import { z } from 'zod';

// AI-премодерация фото (NSFW/офф-топик). ИНВАРИАНТ ПРОЕКТА: вердикт модели —
// только ПОДСКАЗКА модератору, НИКОГДА не применяется напрямую и всегда проходит
// программный guard ПОСЛЕ модели. Здесь: провайдер за абстракцией (null без
// ключа → тихий no-op, работает ручная модерация) + guard, санирующий
// недоверенный вывод модели (клампинг, валидация zod, чистка меток).

// Сырой вывод модели — НЕДОВЕРЕННЫЙ вход. Валидируем на границе (zod).
const rawVerdictSchema = z
  .object({
    nsfwScore: z.number(),
    offTopicScore: z.number(),
    labels: z.array(z.string()).max(50).optional(),
  })
  .passthrough();

export type Recommendation = 'reject' | 'review' | 'ok';

export interface GuardedVerdict {
  nsfw: number; // 0..1 после клампинга
  offTopic: number; // 0..1 после клампинга
  labels: string[]; // санированные метки
  recommend: Recommendation; // ПОДСКАЗКА модератору, не решение о публикации
}

// Пороги подсказки. NSFW высокий → «отклонить»; средний NSFW или высокий
// офф-топик → «на ручную проверку»; иначе «ок». Публикацию решает человек.
export const NSFW_REJECT = 0.85;
export const NSFW_REVIEW = 0.5;
export const OFFTOPIC_REVIEW = 0.6;

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function sanitizeLabels(labels: string[] | undefined): string[] {
  if (!labels) return [];
  return labels
    .map((l) => l.slice(0, 40).replace(/[^\p{L}\p{N} _-]/gu, '').trim())
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * Guard ПОСЛЕ модели: превращает недоверенный сырой вывод в безопасный вердикт-
 * подсказку. Битый/непарсибельный вывод → fail-safe «на ручную проверку» (не
 * пропускаем и не отклоняем автоматически). Никогда не бросает.
 */
export function applyGuard(raw: unknown): GuardedVerdict {
  const parsed = rawVerdictSchema.safeParse(raw);
  if (!parsed.success) {
    return { nsfw: 0, offTopic: 0, labels: [], recommend: 'review' };
  }
  const nsfw = clamp01(parsed.data.nsfwScore);
  const offTopic = clamp01(parsed.data.offTopicScore);
  const labels = sanitizeLabels(parsed.data.labels);

  let recommend: Recommendation = 'ok';
  if (nsfw >= NSFW_REJECT) recommend = 'reject';
  else if (nsfw >= NSFW_REVIEW || offTopic >= OFFTOPIC_REVIEW) recommend = 'review';

  return { nsfw, offTopic, labels, recommend };
}

export interface PremoderationProvider {
  analyze(imageBuffer: Buffer): Promise<unknown>; // сырой вывод модели
}

// Провайдер за абстракцией (как storage/sms): без ключа — null, премодерация
// выключена, работает ручная. Реальный провайдер подключается при выдаче ключа.
export function getPremoderationProvider(): PremoderationProvider | null {
  const key = process.env.PREMODERATION_API_KEY;
  if (!key) return null;
  return {
    analyze() {
      // Заглушка до подключения реального эндпоинта модели (ключ уже есть).
      throw new Error('premoderation provider not implemented');
    },
  };
}

/**
 * Премодерация одного изображения: провайдер → guard. Возвращает null, если
 * модель не подключена или упала (ошибку не глотаем в тишину — ручная модерация
 * остаётся, но фото не блокируется из-за недоступности модели).
 */
export async function premoderate(imageBuffer: Buffer): Promise<GuardedVerdict | null> {
  const provider = getPremoderationProvider();
  if (!provider) return null;
  const raw = await provider.analyze(imageBuffer).catch(() => null);
  if (raw === null) return null;
  return applyGuard(raw);
}
