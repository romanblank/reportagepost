import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Health — единственное окно наружу.
 *
 * Проверяем не «отвечает 200», а что он показывает КАЖДУЮ молчаливую
 * интеграцию. Дважды мы уже узнавали о поломке от пользователя: почта отвергала
 * отправку, а модель модерации молчала — и снаружи оба состояния выглядели как
 * «всё хорошо».
 */
describe.skipIf(!hasDb)('/health показывает состояние платформы', () => {
  it('перечисляет все интеграции, от которых зависит путь пользователя', async () => {
    const { GET } = await import('@/app/health/route');
    const res = await GET();
    const body = (await res.json()) as {
      integrations: Record<string, string>;
      jobs: Record<string, string>;
    };

    // Каждая из них устроена как тихий no-op без ключей: пропущенная строка
    // здесь означает поломку, о которой мы узнаем последними
    for (const key of ['mail', 'emailGate', 'sms', 'payments', 'storage', 'telegram', 'vision', 'textModel']) {
      expect(body.integrations[key], `нет состояния «${key}» в /health`).toBeTruthy();
    }

    // Фоновые задачи: молчащий воркер — это тишина, а не видимый отказ
    const { JOB_THRESHOLDS } = await import('@/lib/job-thresholds');
    for (const name of Object.keys(JOB_THRESHOLDS)) {
      expect(body.jobs[name], `нет состояния задачи «${name}» в /health`).toBeTruthy();
    }
  });

  it('состояние гейта почты отражает рубильник, а не догадку', async () => {
    // Самое коварное состояние: почта настроена, письма не доходят, и гейт
    // молча запирает каждого нового пользователя
    const { GET } = await import('@/app/health/route');
    const before = process.env.EMAIL_GATE;

    process.env.EMAIL_GATE = 'off';
    const off = (await (await GET()).json()) as { integrations: Record<string, string> };
    expect(off.integrations.emailGate).toBe('off');

    if (before === undefined) delete process.env.EMAIL_GATE;
    else process.env.EMAIL_GATE = before;
  });
});
