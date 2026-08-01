'use client';

import { useRef, useState } from 'react';
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
function useToggle(path: string, initial: boolean, authed: boolean) {
  const router = useRouter();
  const { toast } = useToast();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  // ref, а не state: нужен мгновенный барьер для второго тапа в том же кадре,
  // до того как React успеет перерисовать кнопку с disabled.
  const inFlight = useRef(false);

  async function toggle(): Promise<boolean | null> {
    if (!authed) {
      router.push('/ru/login');
      return null;
    }
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);

    const next = !on;
    setOn(next);
    const ok = await apiOk(path, { method: 'POST' });
    if (!ok) {
      // Откат от ЯВНОГО снимка, а не от текущего значения: второй источник
      // правды здесь и приводил к расхождению счётчика.
      setOn(!next);
      toast(ru.ui.toastError, 'danger');
    }
    inFlight.current = false;
    setBusy(false);
    return ok ? next : null;
  }

  return { on, busy, toggle };
}

export function LikeButton({ photoId, initialLiked, initialCount, authed, onDark = false }: {
  photoId: string;
  initialLiked: boolean;
  initialCount: number;
  authed: boolean;
  onDark?: boolean;
}) {
  const { on: liked, busy, toggle } = useToggle(`/api/photos/${photoId}/like`, initialLiked, authed);
  const [count, setCount] = useState(initialCount);

  async function onClick() {
    const applied = await toggle();
    // Счётчик двигаем ТОЛЬКО по подтверждённому результату — иначе неудачный
    // запрос оставлял бы число «оптимистично» неверным.
    if (applied !== null) setCount((c) => Math.max(0, c + (applied ? 1 : -1)));
  }

  if (onDark) {
    return (
      <button type="button" onClick={onClick} aria-pressed={liked} disabled={busy} aria-busy={busy}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-white/90 transition hover:text-white disabled:opacity-60">
        <Icon name={liked ? 'heart-filled' : 'heart'} size={17} />
        {count > 0 && <span className="tnum">{count}</span>}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={liked} disabled={busy} aria-busy={busy}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ${liked ? 'bg-ink text-paper' : 'border-line hover:bg-surface-2'}`}>
      <Icon name={liked ? 'heart-filled' : 'heart'} size={16} />
      <span className="tnum">{count}</span>
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
