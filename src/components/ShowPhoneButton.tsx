'use client';

import { useState } from 'react';
import { ru } from '@/i18n/ru';

// «Показать номер» (паритет MyWed): телефона нет в SSR-разметке — раскрытие
// кликом через API (спам-ботам нечего парсить, автору — событие в статистику).
export function ShowPhoneButton({ profileId }: { profileId: string }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function reveal() {
    setPending(true);
    const res = await fetch(`/api/profiles/${profileId}/phone`, { method: 'POST' }).catch(() => null);
    setPending(false);
    if (res?.ok) {
      const data = (await res.json()) as { phone: string };
      setPhone(data.phone);
      return;
    }
    setFailed(true); // редкий случай (лимит/скрыт после рендера) — честно молчим кнопкой
  }

  if (failed) return null;
  if (phone) {
    return (
      <a href={`tel:${phone}`} className="rounded-full border border-line px-3 py-1.5 tnum transition hover:bg-surface-2">
        {formatPhone(phone)}
      </a>
    );
  }
  return (
    <button type="button" onClick={reveal} disabled={pending}
      className="rounded-full border border-line px-3 py-1.5 transition hover:bg-surface-2 disabled:opacity-60">
      {pending ? ru.ui.loading : ru.profile.showPhone}
    </button>
  );
}

// +79991234567 → +7 999 123-45-67 (только отображение; хранение — E.164)
function formatPhone(e164: string): string {
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : e164;
}
