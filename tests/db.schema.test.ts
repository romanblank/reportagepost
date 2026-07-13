import { describe, expect, it } from 'vitest';
import 'dotenv/config';

// Env-зависимость (правило c, CLAUDE.md): тест требует локальный PG
// (docker compose up -d). Без DATABASE_URL — честный skip, не false-negative.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('schema: ядро БД', () => {
  it('CRUD-цикл: пользователь → событие активности → откат', async () => {
    const { db } = await import('@/lib/db');

    const user = await db.user.create({
      data: {
        role: 'PHOTOGRAPHER',
        firstName: 'Тест',
        lastName: 'Схемов',
        email: `schema-test-${Date.now()}@local.test`,
      },
    });
    expect(user.status).toBe('PENDING'); // новый фотограф — на модерацию

    const event = await db.activityEvent.create({
      data: {
        actorUserId: user.id,
        type: 'PROFILE_VIEW',
        targetType: 'PROFILE',
        targetId: user.id,
      },
    });
    expect(event.weightMilli).toBe(1000); // вес по умолчанию 1.000

    // Событийный журнал append-only, но тестовые данные подчищаем
    await db.activityEvent.delete({ where: { id: event.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});
