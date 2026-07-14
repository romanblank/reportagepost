'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Живые обновления через SSE (/api/stream): при событии message/notification
// обновляем серверные данные страницы (router.refresh) — прилетают новые
// сообщения, счётчики. Фолбэк: если SSE недоступен/оборвался — мягкий polling
// (25с) как страховка. Монтируется только для авторизованных (в layout).
export function LiveUpdates() {
  const router = useRouter();

  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const refresh = () => router.refresh();
    const startPollingFallback = () => {
      if (poll) return; // уже включён
      poll = setInterval(refresh, 25000);
    };

    try {
      es = new EventSource('/api/stream');
      es.addEventListener('message', refresh);
      es.addEventListener('notification', refresh);
      es.onerror = startPollingFallback; // блокирован/оборван — страхуемся polling'ом
    } catch {
      startPollingFallback();
    }

    return () => {
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [router]);

  return null;
}
