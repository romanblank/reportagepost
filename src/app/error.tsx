'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ru } from '@/i18n/ru';

// Error-boundary приложения (аудит 2026-07-31, P0): во всём App Router не было
// ни одного — любой сбой в серверном компоненте (обрыв к БД, таймаут хранилища)
// показывал системную заглушку Next без шапки, бренда и пути назад. На закрытой
// бете первое впечатление единственное, а ретрая человеку никто не предлагал.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // digest — единственная ниточка к серверному стеку в логах контейнера
    console.error('[app] unhandled error:', error.digest ?? '', error.message);
    // Отправляем оператору: иначе ошибка видна только в консоли самого
    // пользователя, то есть никому (аудит P1 «нулевая видимость ошибок»).
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        digest: error.digest,
        message: error.message,
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-5xl font-semibold text-accent">!</p>
      <h1 className="mt-4 t-h2">{ru.errorPage.title}</h1>
      <p className="mt-2 muted">{ru.errorPage.text}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="btn btn-accent">{ru.errorPage.retry}</button>
        <Link href="/" className="btn btn-outline">{ru.notFound.home}</Link>
      </div>
      {error.digest && <p className="mt-6 font-mono t-fine muted">{ru.errorPage.code}: {error.digest}</p>}
    </main>
  );
}
