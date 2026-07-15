'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ru } from '@/i18n/ru';

const KEY = 'rp-cookie-consent';

// Баннер согласия на cookie (РФ-требование). Чтение localStorage через
// useSyncExternalStore — SSR-safe и без setState-в-эффекте (react-hooks/set-state-in-effect).
// Серверный снапшот = «согласие есть» → баннер не мигает при гидрации.
function readConsent(): boolean {
  try {
    return Boolean(localStorage.getItem(KEY));
  } catch {
    return true; // приватный режим — не докучаем
  }
}

export function CookieConsent() {
  const consented = useSyncExternalStore(
    () => () => {},
    readConsent,
    () => true,
  );
  const [dismissed, setDismissed] = useState(false);

  if (consented || dismissed) return null;

  return (
    <div className="fixed inset-x-2 bottom-20 z-40 max-w-md rounded-xl border border-line bg-surface p-4 shadow-md sm:inset-x-auto sm:bottom-4 sm:right-4">
      <p className="text-sm">
        {ru.cookie.text}{' '}
        <Link href="/ru/legal/privacy" className="underline">{ru.cookie.more}</Link>
      </p>
      <button type="button"
        onClick={() => { try { localStorage.setItem(KEY, '1'); } catch { /* приватный режим */ } setDismissed(true); }}
        className="btn btn-accent mt-3 px-4 py-1.5 text-sm">
        {ru.cookie.accept}
      </button>
    </div>
  );
}
