'use client';

import { useState } from 'react';
import { ru } from '@/i18n/ru';

// «Показать номер» (паритет MyWed): телефона нет в SSR-разметке — раскрытие
// кликом через API (спам-ботам нечего парсить, автору — событие в статистику).
export function ShowPhoneButton({ profileId }: { profileId: string }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal() {
    setPending(true);
    const res = await fetch(`/api/profiles/${profileId}/phone`, { method: 'POST' }).catch(() => null);
    setPending(false);
    if (res?.ok) {
      const data = (await res.json()) as { phone: string };
      setPhone(data.phone);
      return;
    }
    // Кнопку НЕ прячем (аудит 2026-07-31, P1): это последняя миля денежного
    // пути — заказчик решил звонить. Исчезающий под пальцем CTA читается как
    // «телефона нет / сайт сломан», а перезагрузить страницу никто не догадается.
    // 429 здесь штатное состояние: двойной тап на телефоне уже может его словить.
    setError(res?.status === 429 ? ru.profile.phoneTooOften : ru.ui.toastError);
  }
  if (phone) {
    return (
      <a href={`tel:${phone}`} className="rounded-full border border-line px-3 py-1.5 tnum transition hover:bg-surface-2">
        {formatPhone(phone)}
      </a>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={reveal} disabled={pending}
        className="rounded-full border border-line px-3 py-1.5 transition hover:bg-surface-2 disabled:opacity-60">
        {pending ? ru.ui.loading : ru.profile.showPhone}
      </button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </span>
  );
}

// +79991234567 → +7 999 123-45-67 (только отображение; хранение — E.164)
function formatPhone(e164: string): string {
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : e164;
}
