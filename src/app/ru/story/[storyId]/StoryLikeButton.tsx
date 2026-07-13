'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function StoryLikeButton({ storyId, initialLiked, initialCount, authed }: {
  storyId: string;
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
    setLiked(!liked);
    setCount((c) => c + (liked ? -1 : 1));
    const res = await fetch(`/api/stories/${storyId}/like`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) {
      setLiked(liked);
      setCount((c) => c + (liked ? 1 : -1));
    }
  }

  return (
    <button onClick={toggle} aria-pressed={liked}
      className={`rounded-full border px-4 py-1 text-sm ${liked ? 'bg-foreground text-background' : ''}`}>
      ♥ {count}
    </button>
  );
}
