'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';

export function LikeButton({ photoId, initialLiked, initialCount, authed, onDark = false }: {
  photoId: string;
  initialLiked: boolean;
  initialCount: number;
  authed: boolean;
  onDark?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);

  async function toggle() {
    if (!authed) {
      router.push('/ru/login');
      return;
    }
    setLiked(!liked);
    setCount((c) => c + (liked ? -1 : 1));
    const res = await fetch(`/api/photos/${photoId}/like`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) {
      setLiked(liked);
      setCount((c) => c + (liked ? 1 : -1));
      toast(ru.ui.toastError, 'danger');
    }
  }

  if (onDark) {
    return (
      <button type="button" onClick={toggle} aria-pressed={liked}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-white/90 transition hover:text-white">
        <Icon name={liked ? 'heart-filled' : 'heart'} size={17} />
        {count > 0 && <span className="tnum">{count}</span>}
      </button>
    );
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={liked}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${liked ? 'bg-ink text-paper' : 'border-line hover:bg-surface-2'}`}>
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
  const router = useRouter();
  const { toast } = useToast();
  const [following, setFollowing] = useState(initialFollowing);

  async function toggle() {
    if (!authed) {
      router.push('/ru/login');
      return;
    }
    setFollowing(!following);
    const res = await fetch(`/api/photographers/${userId}/follow`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) {
      setFollowing(following);
      toast(ru.ui.toastError, 'danger');
    }
  }

  return (
    <button type="button" onClick={toggle} aria-pressed={following}
      className={`btn btn-outline btn-sm ${following ? 'chip-active' : ''}`}>
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
  const router = useRouter();
  const { toast } = useToast();
  const [fav, setFav] = useState(initialFavorited);

  async function toggle() {
    if (!authed) {
      router.push('/ru/login');
      return;
    }
    setFav(!fav);
    const res = await fetch(`/api/photographers/${userId}/favorite`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) {
      setFav(fav);
      toast(ru.ui.toastError, 'danger');
    }
  }

  return (
    <button type="button" onClick={toggle} aria-pressed={fav}
      className={`btn btn-sm ${fav ? 'btn-outline' : 'btn-ghost'}`}>
      <Icon name={fav ? 'star-filled' : 'star'} size={16} />
      {fav ? ru.engage.favorited : ru.engage.favorite}
    </button>
  );
}
