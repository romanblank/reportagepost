import { describe, expect, it } from 'vitest';

/**
 * Секрет TOTP нельзя хешировать — он нужен целиком, чтобы посчитать код.
 * Значит, единственная защита от утечки через ночной дамп базы — шифрование
 * ключом, которого в дампе нет.
 */
describe('шифрование секретов', () => {
  it('шифрует и расшифровывает обратно, шифротекст не похож на исходник', async () => {
    process.env.SECRET_BOX_KEY = 'test-key-for-secret-box-0123456789';
    const { encryptSecret, decryptSecret, isEncrypted } = await import('@/lib/secret-box');

    const plain = 'JBSWY3DPEHPK3PXP';
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    expect(isEncrypted(enc)).toBe(true);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('каждый раз даёт разный шифротекст — одинаковые секреты не выдают себя', async () => {
    process.env.SECRET_BOX_KEY = 'test-key-for-secret-box-0123456789';
    const { encryptSecret } = await import('@/lib/secret-box');
    expect(encryptSecret('одно и то же')).not.toBe(encryptSecret('одно и то же'));
  });

  it('подмена шифротекста не проходит незаметно', async () => {
    process.env.SECRET_BOX_KEY = 'test-key-for-secret-box-0123456789';
    const { encryptSecret, decryptSecret } = await import('@/lib/secret-box');
    const enc = encryptSecret('секрет');
    // Портим полезную нагрузку: GCM обязан это заметить, а не вернуть мусор
    const [head, iv, data, tag] = enc.split('.');
    const broken = [head, iv, data.slice(0, -2) + 'AA', tag].join('.');
    expect(() => decryptSecret(broken)).toThrow();
  });

  it('старые незашифрованные значения читаются как есть — переход без простоя', async () => {
    process.env.SECRET_BOX_KEY = 'test-key-for-secret-box-0123456789';
    const { decryptSecret } = await import('@/lib/secret-box');
    expect(decryptSecret('JBSWY3DPEHPK3PXP')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('без ключа значение остаётся открытым, но платформа не падает', async () => {
    delete process.env.SECRET_BOX_KEY;
    const { encryptSecret, secretBoxAvailable } = await import('@/lib/secret-box');
    expect(secretBoxAvailable()).toBe(false);
    expect(encryptSecret('секрет')).toBe('секрет');
  });
});
