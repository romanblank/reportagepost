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

// IAM-токен из metadata сервисного аккаунта инстанса (тот же механизм, что тянет
// Lockbox). Работает только на VM; локально/без SA — null.
async function iamToken(): Promise<string | null> {
  try {
    const res = await fetch(
      'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token',
      // Metadata отвечает мгновенно или недоступен вовсе — ждать нечего
      { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(2_000) },
    );
    const data = await res.json();
    return data?.access_token ?? null;
  } catch {
    return null;
  }
}

// Разбор ответа Yandex Vision (модель «moderation») → форма для guard. Чистая
// функция, тестируема. adult/gruesome → nsfw (берём максимум); метки с p>0.5.
export function mapVisionResponse(json: unknown): { nsfwScore: number; offTopicScore: number; labels: string[] } {
  const props =
    (json as { results?: { results?: { classification?: { properties?: { name?: string; probability?: number }[] } }[] }[] })
      ?.results?.[0]?.results?.[0]?.classification?.properties ?? [];
  const p = (name: string): number => props.find((x) => x.name === name)?.probability ?? 0;
  const nsfwScore = Math.max(p('adult'), p('gruesome'));
  const labels = props.filter((x) => (x.probability ?? 0) > 0.5 && x.name).map((x) => x.name as string);
  return { nsfwScore, offTopicScore: 0, labels }; // офф-топик Vision не даёт — 0
}

// Провайдер за абстракцией: Yandex Vision (модель moderation). Активен, если задан
// YC_FOLDER_ID и доступен IAM-токен инстанса (роль ai.vision.user у SA VM). Иначе
// null — премодерация выключена, работает ручная модерация.
export function getPremoderationProvider(): PremoderationProvider | null {
  const folderId = process.env.YC_FOLDER_ID;
  if (!folderId) return null;
  return {
    async analyze(imageBuffer: Buffer) {
      const token = await iamToken();
      if (!token) return null;
      const res = await fetch('https://vision.api.cloud.yandex.net/vision/v1/batchAnalyze', {
        method: 'POST',
        // Дедлайн обязателен (аудит 2026-08-16): вызов живёт в пути загрузки
        // фото, и деградация Vision до минуты на ответ копила бы 40-МБ буферы
        // параллельных загрузок до OOM. Сбой = null = кадр к человеку
        signal: AbortSignal.timeout(8_000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId,
          analyzeSpecs: [
            {
              content: imageBuffer.toString('base64'),
              features: [{ type: 'CLASSIFICATION', classificationConfig: { model: 'moderation' } }],
            },
          ],
        }),
      });
      if (!res.ok) return null;
      return mapVisionResponse(await res.json());
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
