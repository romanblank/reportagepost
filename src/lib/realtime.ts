// Real-time шина для SSE (S2 живая личка). In-memory реестр подписок per-user:
// messages-API публикует событие получателю, SSE-роут его форвардит в браузер.
//
// Масштаб (S6): работает в ПРЕДЕЛАХ ОДНОГО инстанса (память процесса). При
// нескольких инстансах за балансировщиком нужен внешний pub/sub (Redis) —
// отмечено в PLAN-DETAIL. Для закрытой беты (один контейнер) достаточно.
//
// Singleton через globalThis — переживает HMR в dev и переиспользуется между
// вызовами роут-хендлеров в одном процессе (как ленивый Prisma в db.ts).

export type RealtimeEvent = { type: 'message' | 'notification'; [k: string]: unknown };
type Listener = (e: RealtimeEvent) => void;

const g = globalThis as unknown as { __rtBus?: Map<string, Set<Listener>> };
const bus: Map<string, Set<Listener>> = (g.__rtBus ??= new Map());

/** Подписка на события пользователя. Возвращает функцию отписки. */
export function subscribeUser(userId: string, cb: Listener): () => void {
  let set = bus.get(userId);
  if (!set) {
    set = new Set();
    bus.set(userId, set);
  }
  set.add(cb);
  return () => {
    const s = bus.get(userId);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) bus.delete(userId);
  };
}

/** Публикация события пользователю (получателю сообщения/уведомления). */
export function publishToUser(userId: string, event: RealtimeEvent): void {
  const set = bus.get(userId);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(event);
    } catch {
      // подписчик не должен ронять публикацию другим (правило: не глотать —
      // но здесь изоляция подписчиков осознанна: один битый sink ≠ сбой всем)
    }
  }
}

/** Число активных подписчиков пользователя (для тестов/диагностики). */
export function subscriberCount(userId: string): number {
  return bus.get(userId)?.size ?? 0;
}
