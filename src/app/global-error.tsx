'use client';

import { useEffect } from 'react';
import { ru } from '@/i18n/ru';

// Последний рубеж: сбой в самом корневом layout (сюда не доходит ни шапка, ни
// стили приложения — поэтому разметка автономна и содержит <html>/<body>).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] root layout error:', error.digest ?? '', error.message);
  }, [error]);

  return (
    <html lang="ru">
      <body style={{ margin: 0, background: '#0f1218', color: '#ece7dd', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 44, fontWeight: 600, color: '#e08a5e', margin: 0 }}>!</p>
          <h1 style={{ fontSize: 24, fontWeight: 600, marginTop: 16 }}>{ru.errorPage.title}</h1>
          <p style={{ opacity: 0.7, marginTop: 8 }}>{ru.errorPage.text}</p>
          <button type="button" onClick={reset}
            style={{ marginTop: 24, padding: '10px 20px', borderRadius: 999, border: 0, cursor: 'pointer', background: '#e08a5e', color: '#1a1207', fontSize: 15, fontWeight: 500 }}>
            {ru.errorPage.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
