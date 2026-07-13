'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';

export function LikeButton({ photoId, initialLiked, initialCount, authed }: {
  photoId: string;
  initialLiked: boolean;
  initialCount: number;
  authed: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);

  async function toggle() {
    if (!authed) {
      router.push('/ru/login');
      return;
    }
    // оптимистично
    setLiked(!liked);
    setCount((c) => c + (liked ? -1 : 1));
    const res = await fetch(`/api/photos/${photoId}/like`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) {
      setLiked(liked);
      setCount((c) => c + (liked ? 1 : -1));
    }
  }

  return (
    <button onClick={toggle} aria-pressed={liked}
      className={`rounded-full border px-3 py-1 text-sm ${liked ? 'bg-foreground text-background' : ''}`}>
      ♥ {count}
    </button>
  );
}

export function FollowButton({ userId, initialFollowing, authed }: {
  userId: string;
  initialFollowing: boolean;
  authed: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);

  async function toggle() {
    if (!authed) {
      router.push('/ru/login');
      return;
    }
    setFollowing(!following);
    const res = await fetch(`/api/photographers/${userId}/follow`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) setFollowing(following);
  }

  return (
    <button onClick={toggle} aria-pressed={following}
      className={`rounded-full border px-4 py-1 text-sm ${following ? 'bg-foreground text-background' : ''}`}>
      {following ? ru.engage.following : ru.engage.follow}
    </button>
  );
}

export function MessageButton({ userId }: { userId: string }) {
  const router = useRouter();
  return (
    <button onClick={() => router.push(`/ru/messages/${userId}`)}
      className="rounded-full border px-4 py-1 text-sm">
      {ru.engage.write}
    </button>
  );
}

export function FavoriteButton({ userId, initialFavorited, authed }: {
  userId: string;
  initialFavorited: boolean;
  authed: boolean;
}) {
  const router = useRouter();
  const [fav, setFav] = useState(initialFavorited);

  async function toggle() {
    if (!authed) {
      router.push('/ru/login');
      return;
    }
    setFav(!fav);
    const res = await fetch(`/api/photographers/${userId}/favorite`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) setFav(fav);
  }

  return (
    <button onClick={toggle} aria-pressed={fav}
      className={`rounded-full border px-4 py-1 text-sm ${fav ? 'bg-foreground text-background' : ''}`}>
      {fav ? `★ ${ru.engage.favorited}` : `☆ ${ru.engage.favorite}`}
    </button>
  );
}
