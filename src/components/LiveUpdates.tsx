'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Живые обновления через SSE (/api/stream): при событии message/notification
// обновляем серверные данные страницы (router.refresh) — прилетают новые
// сообщения, счётчики. Монтируется только для авторизованных (в layout).
//
// Фолбэк-polling здесь страховка, а не второй штатный канал (аудит 2026-08-01,
// P2). Раньше он вёл себя иначе: EventSource переподключается сам, но onerror
// уже включал setInterval(refresh, 25000), и тот жил до перезагрузки вкладки.
// В итоге работали ОБА канала сразу. А через мобильных операторов и прокси,
// режущих долгие соединения, onerror срабатывает почти у всех — то есть это
// была не редкая ветка, а норма. Каждый refresh на force-dynamic странице —
// полный серверный ререндер (профиль ≈ 12 запросов в БД) на каждую открытую
// вкладку каждого залогиненного, плюс страницы «дёргались» подменой данных
// под курсором каждые 25 секунд.
const POLL_MS = 25_000;
// Один разрыв — это норма для мобильной сети, EventSource переподключится сам.
// Страхуемся только когда переподключиться не удаётся подряд.
const ERRORS_BEFORE_FALLBACK = 3;

export function LiveUpdates() {
  const router = useRouter();

  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let errorStreak = 0;

    const refresh = () => {
      // В фоновой вкладке обновлять нечего — данные всё равно никто не видит,
      // а нагрузка на единственную VM растёт по числу открытых вкладок.
      if (typeof document !== 'undefined' && document.hidden) return;
      router.refresh();
    };

    const stopPolling = () => {
      if (!poll) return;
      clearInterval(poll);
      poll = null;
    };
    const startPollingFallback = () => {
      if (poll) return;
      poll = setInterval(refresh, POLL_MS);
    };

    try {
      es = new EventSource('/api/stream');
      es.addEventListener('message', refresh);
      es.addEventListener('notification', refresh);
      es.onopen = () => {
        // Стрим ожил — страховка больше не нужна, гасим её немедленно
        errorStreak = 0;
        stopPolling();
      };
      es.onerror = () => {
        errorStreak += 1;
        if (errorStreak >= ERRORS_BEFORE_FALLBACK) startPollingFallback();
      };
    } catch {
      startPollingFallback();
    }

    return () => {
      es?.close();
      stopPolling();
    };
  }, [router]);

  return null;
}
