'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

// Переключатели внешних уведомлений. Сохраняются сразу по клику — отдельная
// кнопка «Сохранить» для двух тумблеров только мешает.
export function NotifyPrefs({
  initialEmail,
  initialTg,
  hasTelegram,
}: {
  initialEmail: boolean;
  initialTg: boolean;
  hasTelegram: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [tg, setTg] = useState(initialTg);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  async function save(patch: { notifyInquiriesEmail?: boolean; notifyInquiriesTg?: boolean }) {
    setError(false);
    const res = await apiFetch('/api/profile/notifications', { method: 'PATCH', body: patch });
    if (res?.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }
    // Откатываем тумблер: показывать «выключено», когда сервер не принял — врать
    setError(true);
    if (patch.notifyInquiriesEmail !== undefined) setEmail(!patch.notifyInquiriesEmail);
    if (patch.notifyInquiriesTg !== undefined) setTg(!patch.notifyInquiriesTg);
  }

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-caption muted">{ru.notifyPrefs.title}</p>
        {saved && <span className="text-xs text-recognition">{ru.notifyPrefs.saved}</span>}
      </div>
      <p className="mt-1 text-sm muted">{ru.notifyPrefs.lead}</p>

      <label className="mt-3 flex cursor-pointer items-center gap-2.5">
        <input type="checkbox" checked={email} className="size-4 accent-[var(--accent)]"
          onChange={(e) => { setEmail(e.target.checked); void save({ notifyInquiriesEmail: e.target.checked }); }} />
        <span className="text-sm">{ru.notifyPrefs.email}</span>
      </label>

      {hasTelegram && (
        <label className="mt-2 flex cursor-pointer items-center gap-2.5">
          <input type="checkbox" checked={tg} className="size-4 accent-[var(--accent)]"
            onChange={(e) => { setTg(e.target.checked); void save({ notifyInquiriesTg: e.target.checked }); }} />
          <span className="text-sm">{ru.notifyPrefs.telegram}</span>
        </label>
      )}

      <p className="mt-3 text-xs muted">{ru.notifyPrefs.note}</p>
      {error && <p role="alert" className="mt-1 text-sm text-danger">{ru.ui.toastError}</p>}
    </section>
  );
}
