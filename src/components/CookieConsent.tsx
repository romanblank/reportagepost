'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { apiOk } from '@/lib/api';

const KEY = 'rp-cookie-consent';

/**
 * Баннер согласия на cookie (аудит 2026-08-01, P2).
 *
 * Было три проблемы. Отказаться было нельзя — единственная кнопка «Принять», то
 * есть выбора не существовало. Факт согласия жил только в localStorage:
 * доказать его наличие оператор не мог никак, баннер существовал для вида — а
 * РКН устойчиво трактует cookie вместе с IP как персональные данные. И
 * необязательный трекинг (beacon просмотров профиля) работал независимо от
 * того, согласился человек или нет.
 *
 * Теперь: два равноправных выбора, решение уходит на сервер и записывается
 * cookie с версией политики — это доказуемый след, — а отказ реально выключает
 * необязательный трекинг (проверка в /api/profile-view).
 *
 * Чтение localStorage через useSyncExternalStore — SSR-safe и без setState в
 * эффекте. Серверный снапшот = «решение есть», чтобы баннер не мигал при
 * гидрации.
 */
function readDecision(): boolean {
  try {
    return Boolean(localStorage.getItem(KEY));
  } catch {
    return true; // приватный режим — не докучаем
  }
}

/**
 * Открыть баннер заново.
 *
 * Отзыв решения должен быть не сложнее его дачи: до этого баннер исчезал
 * навсегда, и передумать было нельзя нигде в интерфейсе. Ссылка «Настройки
 * cookie» в подвале вызывает эту функцию.
 */
export function reopenCookieBanner(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* приватный режим: баннер и так покажется */
  }
  window.dispatchEvent(new Event(REOPEN_EVENT));
}

export const REOPEN_EVENT = 'rp:cookie-reopen';

export function CookieConsent() {
  const decided = useSyncExternalStore(
    (onChange) => {
      window.addEventListener(REOPEN_EVENT, onChange);
      return () => window.removeEventListener(REOPEN_EVENT, onChange);
    },
    readDecision,
    () => true,
  );
  const [dismissed, setDismissed] = useState(false);
  // Повторный вызов из подвала должен показать баннер, даже если его уже закрывали
  useEffect(() => {
    const reopen = () => setDismissed(false);
    window.addEventListener(REOPEN_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_EVENT, reopen);
  }, []);

  if (decided || dismissed) return null;

  async function decide(analytics: boolean) {
    try {
      localStorage.setItem(KEY, analytics ? 'all' : 'necessary');
    } catch {
      /* приватный режим: решение сохранит серверная cookie ниже */
    }
    setDismissed(true);
    // Серверный след: без него доказать согласие невозможно. Блокирующе не
    // ждём — интерфейс не должен зависеть от сети в этот момент.
    void apiOk('/api/cookie-consent', { method: 'POST', body: { analytics } });
  }

  return (
    <div className="fixed inset-x-2 bottom-20 z-40 max-w-md rounded-media border border-line bg-surface p-4 shadow-md sm:inset-x-auto sm:bottom-4 sm:right-4">
      <p className="t-small">
        {ru.cookie.text}{' '}
        <Link href="/ru/legal/privacy" className="underline">{ru.cookie.more}</Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void decide(true)} className="btn btn-accent px-4 py-1.5 t-small">
          {ru.cookie.accept}
        </button>
        <button type="button" onClick={() => void decide(false)} className="btn btn-ghost px-4 py-1.5 t-small">
          {ru.cookie.onlyNecessary}
        </button>
      </div>
    </div>
  );
}
