import { describe, expect, it } from 'vitest';
import { publishToUser, subscribeUser, subscriberCount } from '@/lib/realtime';

describe('realtime bus: подписки per-user (чистая логика)', () => {
  it('доставляет событие подписчику пользователя', () => {
    const got: unknown[] = [];
    const unsub = subscribeUser('u1', (e) => got.push(e));
    publishToUser('u1', { type: 'message', from: 'x' });
    expect(got).toEqual([{ type: 'message', from: 'x' }]);
    unsub();
  });

  it('изоляция: событие u1 не приходит подписчику u2', () => {
    const a: unknown[] = [];
    const b: unknown[] = [];
    const ua = subscribeUser('a', (e) => a.push(e));
    const ub = subscribeUser('b', (e) => b.push(e));
    publishToUser('a', { type: 'notification' });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
    ua(); ub();
  });

  it('отписка убирает слушателя и чистит пустой набор', () => {
    const unsub = subscribeUser('z', () => {});
    expect(subscriberCount('z')).toBe(1);
    unsub();
    expect(subscriberCount('z')).toBe(0);
  });

  it('несколько подписчиков одного пользователя получают все', () => {
    let n = 0;
    const u1 = subscribeUser('m', () => { n++; });
    const u2 = subscribeUser('m', () => { n++; });
    expect(subscriberCount('m')).toBe(2);
    publishToUser('m', { type: 'message' });
    expect(n).toBe(2);
    u1(); u2();
  });

  it('битый подписчик не ломает доставку остальным', () => {
    let ok = false;
    const bad = subscribeUser('e', () => { throw new Error('boom'); });
    const good = subscribeUser('e', () => { ok = true; });
    publishToUser('e', { type: 'message' });
    expect(ok).toBe(true);
    bad(); good();
  });

  it('публикация без подписчиков — тихо, без ошибки', () => {
    expect(() => publishToUser('nobody', { type: 'message' })).not.toThrow();
  });
});
