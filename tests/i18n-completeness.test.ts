import { describe, expect, it } from 'vitest';
import { ru, label } from '@/i18n/ru';
import { PLAN_FEATURES } from '@/lib/pricing';

// Полнота словарных карт (аудит 2026-08-01, P1).
//
// Карты помечены `as Record<string, string>`, из-за чего TypeScript не проверяет,
// что для каждого ключа из кода есть строка. Добавили перк, уровень подписки или
// причину жалобы — забыли текст, и пользователь видит пустоту (а раньше —
// буквальное «undefined»). Компилятор молчит, тест — нет.

describe('i18n: карты покрывают все ключи, используемые в коде', () => {
  it('перки тарифов описаны все до одного', () => {
    const missing = PLAN_FEATURES.map((f) => f.key).filter((k) => !ru.pro.features[k]);
    expect(missing, `нет описания перков: ${missing.join(', ')}`).toEqual([]);
  });

  it('уровни подписки названы', () => {
    for (const tier of ['PRIME', 'ELITE']) {
      expect(ru.pro.tierName[tier], `нет названия уровня ${tier}`).toBeTruthy();
    }
  });

  it('причины и объекты жалоб названы все (иначе админ увидит сырой код)', () => {
    const reasons = ['SPAM', 'ABUSE', 'ADULT', 'COPYRIGHT', 'PERSONAL_DATA', 'FRAUD', 'OTHER'];
    const targets = ['USER', 'PHOTO', 'STORY', 'REVIEW', 'COMMENT', 'MESSAGE'];
    for (const r of reasons) {
      expect(ru.report.reasons[r], `нет причины ${r} в форме жалобы`).toBeTruthy();
      expect(ru.adminReports.reasonLabel[r], `нет причины ${r} в админке`).toBeTruthy();
    }
    for (const t of targets) {
      expect(ru.adminReports.targetLabel[t], `нет объекта ${t} в админке`).toBeTruthy();
    }
  });

  it('все значения ModerationStatus подписаны для пользователя', () => {
    // Урок enum-расширения (CLAUDE.md): добавление DRAFT/NEEDS_REVISION уже
    // роняло сборку на исчерпывающих картах. Статусы лежат отдельными ключами,
    // а не картой, поэтому сверяем поимённо — забытый перевод не пройдёт.
    const byStatus: Record<string, string> = {
      DRAFT: ru.cabinet.statusDraft,
      PENDING: ru.cabinet.statusPending,
      NEEDS_REVISION: ru.cabinet.statusRevision,
      APPROVED: ru.cabinet.statusApproved,
      REJECTED: ru.cabinet.statusRejected,
    };
    for (const [status, text] of Object.entries(byStatus)) {
      expect(text, `нет подписи статуса ${status}`).toBeTruthy();
    }
    // Статусы отдельных кадров портфолио — своя тройка
    for (const [k, text] of Object.entries({
      PENDING: ru.portfolio.statusPending,
      APPROVED: ru.portfolio.statusApproved,
      REJECTED: ru.portfolio.statusRejected,
    })) {
      expect(text, `нет подписи статуса фото ${k}`).toBeTruthy();
    }
  });

  it('label() никогда не возвращает undefined — показывает ключ вместо дыры', () => {
    expect(label(ru.pro.tierName, 'PRIME')).toBe('Active');
    // Несуществующий ключ: пользователь увидит технический код, но не пустоту
    expect(label(ru.pro.tierName, 'НЕТ_ТАКОГО')).toBe('НЕТ_ТАКОГО');
    expect(label({}, 'x')).toBe('x');
  });
});
