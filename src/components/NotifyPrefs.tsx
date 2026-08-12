'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

// Переключатели внешних уведомлений. Сохраняются сразу по клику — отдельная
// кнопка «Сохранить» для двух тумблеров только мешает.
export function NotifyPrefs({
  initialEmail,
  initialTg,
  initialForum,
  hasTelegram,
}: {
  initialEmail: boolean;
  initialTg: boolean;
  initialForum: boolean;
  hasTelegram: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [tg, setTg] = useState(initialTg);
  const [forum, setForum] = useState(initialForum);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  async function save(patch: { notifyInquiriesEmail?: boolean; notifyInquiriesTg?: boolean; notifyForumEmail?: boolean }) {
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
    if (patch.notifyForumEmail !== undefined) setForum(!patch.notifyForumEmail);
  }

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-caption muted">{ru.notifyPrefs.title}</p>
        {saved && <span className="t-fine text-recognition">{ru.notifyPrefs.saved}</span>}
      </div>
      <p className="mt-1 t-small muted">{ru.notifyPrefs.lead}</p>

      <label className="mt-3 flex cursor-pointer items-center gap-2.5">
        <input type="checkbox" checked={email} className="size-4 accent-[var(--accent)]"
          onChange={(e) => { setEmail(e.target.checked); void save({ notifyInquiriesEmail: e.target.checked }); }} />
        <span className="t-small">{ru.notifyPrefs.email}</span>
      </label>

      {/* Ответы на форуме — отдельный поток от заявок: человек, отключивший
          рассылку заказов, не обязан терять ответы себе */}
      <label className="mt-2 flex cursor-pointer items-center gap-2.5">
        <input type="checkbox" checked={forum} className="size-4 accent-[var(--accent)]"
          onChange={(e) => { setForum(e.target.checked); void save({ notifyForumEmail: e.target.checked }); }} />
        <span className="t-small">{ru.notifyPrefs.forum}</span>
      </label>

      {hasTelegram && (
        <label className="mt-2 flex cursor-pointer items-center gap-2.5">
          <input type="checkbox" checked={tg} className="size-4 accent-[var(--accent)]"
            onChange={(e) => { setTg(e.target.checked); void save({ notifyInquiriesTg: e.target.checked }); }} />
          <span className="t-small">{ru.notifyPrefs.telegram}</span>
        </label>
      )}

      <p className="mt-3 t-fine muted">{ru.notifyPrefs.note}</p>
      {error && <p role="alert" className="mt-1 t-small text-danger">{ru.ui.toastError}</p>}
    </section>
  );
}
