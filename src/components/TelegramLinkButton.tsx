'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';

// Привязка/отвязка Telegram. Привязан → показываем статус и «Отвязать».
export function TelegramLinkButton({ bound }: { bound: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function link() {
    setPending(true);
    setError(false);
    const res = await fetch('/api/profile/telegram', { method: 'POST' }).catch(() => null);
    setPending(false);
    if (res?.ok) {
      const { url } = await res.json();
      window.open(url, '_blank', 'noopener'); // откроет чат с ботом и /start
    } else {
      setError(true);
    }
  }

  async function unlink() {
    setPending(true);
    await fetch('/api/profile/telegram', { method: 'DELETE' }).catch(() => null);
    setPending(false);
    router.refresh();
  }

  if (bound) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">{ru.tg.bound}</span>
        <button type="button" onClick={unlink} disabled={pending}
          className="text-muted underline transition hover:text-accent">{ru.tg.unlink}</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={link} disabled={pending} className="btn btn-outline w-fit px-3 py-1.5 text-sm">
        {pending ? ru.tg.linking : ru.tg.link}
      </button>
      <span className="field-hint">{error ? ru.tg.error : ru.tg.hint}</span>
    </div>
  );
}
