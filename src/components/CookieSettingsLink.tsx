'use client';

import { reopenCookieBanner } from '@/components/CookieConsent';
import { ru } from '@/i18n/ru';

/**
 * Ссылка «Настройки cookie» в подвале.
 *
 * Отзыв согласия обязан быть не сложнее его дачи. До этого решение принималось
 * один раз и навсегда: баннер исчезал, а изменить выбор в интерфейсе было
 * негде — политика отсылала к настройкам браузера, что отзывом не является.
 */
export function CookieSettingsLink() {
  return (
    <button type="button" onClick={reopenCookieBanner} className="underline hover:no-underline">
      {ru.footer.cookieSettings}
    </button>
  );
}
