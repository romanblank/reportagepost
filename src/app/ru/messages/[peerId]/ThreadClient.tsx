'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';

interface Msg {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export function ThreadClient({ peerId, selfId, initial }: { peerId: string; selfId: string; initial: Msg[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);

  // Синхронизация со свежими данными сервера после router.refresh() (аудит P1):
  // без этого входящие сообщения не появлялись, хотя уже помечались прочитанными
  useEffect(() => {
    setMessages(initial);
  }, [initial]);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = String(new FormData(form).get('body') ?? '').trim();
    if (!body) return;
    setPending(true);
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId: peerId, body }),
    }).catch(() => null);
    setPending(false);
    if (res?.status === 201) {
      form.reset();
      setMessages((prev) => [
        ...prev,
        { id: `tmp-${Date.now()}`, senderId: selfId, body, createdAt: new Date().toISOString() },
      ]);
      router.refresh();
    }
  }

  return (
    <div className="mt-4 flex flex-1 flex-col">
      <ul className="flex flex-col gap-2">
        {messages.map((m) => (
          <li
            key={m.id}
            className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${
              m.senderId === selfId ? 'self-end bg-foreground text-background' : 'self-start'
            }`}
          >
            {m.body}
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <input name="body" required maxLength={4000} placeholder={ru.messages.placeholder}
          className="flex-1 rounded-lg border px-3 py-2" autoComplete="off" />
        <button type="submit" disabled={pending}
          className="rounded-lg bg-foreground px-4 py-2 text-background disabled:opacity-50">
          {ru.messages.send}
        </button>
      </form>
    </div>
  );
}
