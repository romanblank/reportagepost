import { describe, expect, it } from 'vitest';
import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';

const hasDb = Boolean(process.env.DATABASE_URL);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Путь подтверждения адреса — первое, что проходит каждый новый человек.
 * Ошибка здесь стоит аккаунта: без подтверждённой почты закрыты личка и отзывы,
 * а восстановление доступа невозможно в принципе.
 */
describe.skipIf(!hasDb)('подтверждение адреса переживает реальное поведение (БД)', () => {
  it('ссылка из первого письма работает после отправки второго', async () => {
    const { db } = await import('@/lib/db');
    const { confirmEmail } = await import('@/lib/email-verification');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const email = `flow-${stamp}@test.local`;
    const user = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Поток', lastName: 'Писем', email },
    });

    const issue = async (raw: string) => {
      await db.emailVerification.create({
        data: {
          userId: user.id, email, tokenHash: sha256(raw),
          expiresAt: new Date(Date.now() + 48 * 3_600_000),
        },
      });
    };

    // Человек не нашёл первое письмо и запросил второе — обычное поведение,
    // ради которого кнопка «отправить ещё раз» и существует
    const first = randomBytes(16).toString('base64url');
    const second = randomBytes(16).toString('base64url');
    await issue(first);
    await issue(second);

    // Раньше выдача второго письма гасила первое, и найденная позже ссылка
    // отвечала «недействительна» — человек упирался в тупик по нашей вине
    expect((await confirmEmail(first)).outcome).toBe('confirmed');
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailVerifiedAt: true } })).emailVerifiedAt,
    ).not.toBeNull();

    // Вторая ссылка после подтверждения — «уже подтверждено», а не отказ
    expect((await confirmEmail(second)).outcome).toBe('already');

    await db.emailVerification.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});
