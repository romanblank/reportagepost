import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * «Молчаливые» интеграции без ключей обязаны деградировать ПРЕДСКАЗУЕМО
 * (конвенция проекта: no-op/честная ошибка, не падение и не сетевой вызов).
 * Аудит 2026-09-10, П2: sms/llm/error-report такой страховки не имели —
 * регрессия тишины (интеграция молча перестаёт быть no-op и начинает ходить
 * в сеть без конфига или падать) не ловилась ничем.
 */
describe('интеграции без ключей: предсказуемая деградация', () => {
  const saved: Record<string, string | undefined> = {};
  const KEYS = ['SMSC_LOGIN', 'SMSC_PASSWORD', 'LLM_API_URL', 'LLM_MODEL', 'TELEGRAM_ALERT_CHAT_ID'];

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    vi.resetModules();
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('sms: isConfigured=false, send — честная 503, БЕЗ сетевого вызова', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    // Провайдер читает env в конструкторе модуля — импорт после чистки env
    const { smsProvider } = await import('@/lib/sms');
    expect(smsProvider.isConfigured()).toBe(false);
    await expect(smsProvider.send('+79991234567', 'тест')).rejects.toMatchObject({ status: 503 });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('llm: llmConfigured=false, llmComplete → null без сетевого вызова', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { llmConfigured, llmComplete } = await import('@/lib/ai-gpt');
    expect(llmConfigured()).toBe(false);
    expect(await llmComplete('system', 'user')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('error-report: без чата не бросает и не ходит в Telegram', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { reportError } = await import('@/lib/error-report');
    // Репортер вызывается ИЗ обработчиков ошибок — его падение хуже самой ошибки
    await expect(reportError('test-place', new Error('проверка'))).resolves.toBeUndefined();
    // След в логах контейнера остаётся всегда
    expect(errSpy).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
    fetchSpy.mockRestore();
  });
});
