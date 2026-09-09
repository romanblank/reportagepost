'use client';

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';
import { apiOk } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';

/**
 * Хук оптимистичного переключателя (аудит 2026-08-01, P2).
 *
 * Было три копии одного и того же кода с двумя дефектами:
 *  1) кнопка не блокировалась на время запроса, а роут — ПЕРЕКЛЮЧАТЕЛЬ. Двойной
 *     тап по сердечку (на телефоне — обычное дело) отправлял два POST-а, то есть
 *     лайк и тут же анлайк, при этом UI считал состояние по замыканию первого
 *     клика;
 *  2) откат при ошибке правил счётчик относительно уже изменённого значения —
 *     после неудачи число расходилось с сервером до перезагрузки страницы.
 * Лайки материализуются в рейтинг и ленты, так что врал не только интерфейс.
 *
 * Образец правильного поведения в проекте был (AvailabilityCalendar с Set
 * pending), до кнопок вовлечения его просто не донесли.
 */
// ── Общий стор состояния переключателей ──────────────────────────────────────
// Один и тот же кадр рендерится ДВУМЯ независимыми экземплярами кнопок: в
// сетке портфолио и в лайтбоксе. Локальный useState на каждом давал рассинхрон
// (аудит 2026-09-10, П2): лайкнул в просмотре, закрыл — сетка показывает
// старое сердечко и счётчик. Стор в памяти модуля, ключ — path переключателя
// (уникален на сущность×действие), подписка — useSyncExternalStore.
type ToggleState = { on: boolean; count: number };
const toggleStore = new Map<string, ToggleState>();
const toggleSubs = new Map<string, Set<() => void>>();
// Барьер двойного тапа — тоже на КЛЮЧ, а не на экземпляр: две копии кнопки
// одного кадра не должны отправлять два POST-а разом
const togglesInFlight = new Set<string>();

function writeToggle(key: string, next: ToggleState) {
  toggleStore.set(key, next);
  toggleSubs.get(key)?.forEach((fn) => fn());
}

function useToggle(path: string, initial: boolean, authed: boolean, initialCount = 0) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  // Снимок initial-пропсов стабилен на жизнь экземпляра: getSnapshot обязан
  // возвращать один и тот же объект, пока стор молчит
  const initialRef = useRef<ToggleState>({ on: initial, count: initialCount });

  const subscribe = useCallback((cb: () => void) => {
    let set = toggleSubs.get(path);
    if (!set) {
      set = new Set();
      toggleSubs.set(path, set);
    }
    set.add(cb);
    return () => { toggleSubs.get(path)?.delete(cb); };
  }, [path]);
  const getSnapshot = useCallback(() => toggleStore.get(path) ?? initialRef.current, [path]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  async function toggle(): Promise<boolean | null> {
    if (!authed) {
      router.push('/ru/login');
      return null;
    }
    if (togglesInFlight.has(path)) return null;
    togglesInFlight.add(path);
    setBusy(true);

    // Откат — от ЯВНОГО снимка, а не от текущего значения (урок 2026-08-01)
    const prev = state;
    const next = !prev.on;
    writeToggle(path, { on: next, count: Math.max(0, prev.count + (next ? 1 : -1)) });
    const ok = await apiOk(path, { method: 'POST' });
    if (!ok) {
      writeToggle(path, prev);
      toast(ru.ui.toastError, 'danger');
    }
    togglesInFlight.delete(path);
    setBusy(false);
    return ok ? next : null;
  }

  return { on: state.on, count: state.count, busy, toggle };
}

export function LikeButton({ photoId, initialLiked, initialCount, authed, onDark = false }: {
  photoId: string;
  initialLiked: boolean;
  initialCount: number;
  authed: boolean;
  onDark?: boolean;
}) {
  const { on: liked, count, busy, toggle } = useToggle(`/api/photos/${photoId}/like`, initialLiked, authed, initialCount);

  async function onClick() {
    // Счётчик живёт в общем сторе: оптимистичное значение откатывается тем же
    // снимком, что и само состояние — расходиться им больше не из чего
    await toggle();
  }

  if (onDark) {
    return (
      <button type="button" onClick={onClick} aria-pressed={liked} disabled={busy} aria-busy={busy}
        className="inline-flex items-center gap-1.5 t-small font-medium text-white/90 transition hover:text-white disabled:opacity-60">
        <Icon name={liked ? 'heart-filled' : 'heart'} size={17} />
        {count > 0 && <span className="tnum">{count}</span>}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={liked} disabled={busy} aria-busy={busy}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 t-small transition-colors disabled:opacity-60 ${liked ? 'bg-ink text-paper' : 'border-line hover:bg-surface-2'}`}>
      <Icon name={liked ? 'heart-filled' : 'heart'} size={16} />
      <span className="tnum">{count}</span>
    </button>
  );
}

/**
 * Закладка кадра (партнёр 2026-08-18, вкладка «Сохранённые»): личная память
 * зрителя, на рейтинг не влияет — потому и иконка не сердце, а закладка.
 */
export function SavePhotoButton({ photoId, initialSaved, authed }: {
  photoId: string;
  initialSaved: boolean;
  authed: boolean;
}) {
  const { on: saved, busy, toggle } = useToggle(`/api/photos/${photoId}/save`, initialSaved, authed);
  return (
    <button type="button" onClick={() => void toggle()} aria-pressed={saved} disabled={busy} aria-busy={busy}
      aria-label={saved ? ru.engage.unsavePhoto : ru.engage.savePhoto}
      className="inline-flex items-center gap-1.5 t-small font-medium text-white/90 transition hover:text-white disabled:opacity-60">
      <Icon name={saved ? 'bookmark-filled' : 'bookmark'} size={16} />
    </button>
  );
}

export function FollowButton({ userId, initialFollowing, authed }: {
  userId: string;
  initialFollowing: boolean;
  authed: boolean;
}) {
  const { on: following, busy, toggle } = useToggle(`/api/photographers/${userId}/follow`, initialFollowing, authed);

  return (
    <button type="button" onClick={() => void toggle()} aria-pressed={following} disabled={busy} aria-busy={busy}
      className={`btn btn-outline btn-sm disabled:opacity-60 ${following ? 'chip-active' : ''}`}>
      {following ? ru.engage.following : ru.engage.follow}
    </button>
  );
}

export function MessageButton({ userId }: { userId: string }) {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.push(`/ru/messages/${userId}`)} className="btn btn-accent btn-sm">
      <Icon name="message" size={16} /> {ru.engage.write}
    </button>
  );
}

export function FavoriteButton({ userId, initialFavorited, authed }: {
  userId: string;
  initialFavorited: boolean;
  authed: boolean;
}) {
  const { on: fav, busy, toggle } = useToggle(`/api/photographers/${userId}/favorite`, initialFavorited, authed);

  return (
    <button type="button" onClick={() => void toggle()} aria-pressed={fav} disabled={busy} aria-busy={busy}
      className={`btn btn-sm disabled:opacity-60 ${fav ? 'btn-outline' : 'btn-ghost'}`}>
      <Icon name={fav ? 'star-filled' : 'star'} size={16} />
      {fav ? ru.engage.favorited : ru.engage.favorite}
    </button>
  );
}
