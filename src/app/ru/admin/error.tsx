'use client';

import { useEffect } from 'react';
import { ru } from '@/i18n/ru';

// Локальный error-boundary сегмента (аудит 2026-07-31, P0): сбой этой страницы
// не должен уносить весь сайт — шапка и навигация остаются, человек может
// повторить или уйти в другой раздел.
export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[segment] error:', error.digest ?? '', error.message);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <h2 className="t-title">{ru.errorPage.title}</h2>
      <p className="mt-2 text-sm muted">{ru.errorPage.text}</p>
      <button type="button" onClick={reset} className="btn btn-accent mt-5 px-4 py-2 text-sm">
        {ru.errorPage.retry}
      </button>
    </div>
  );
}
