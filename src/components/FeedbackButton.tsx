'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';
import { useToast } from '@/components/ui/Toast';

/**
 * «Сообщить о проблеме» — фидбэк-петля беты (оценка 2026-09-10): её
 * единственный продукт — обратная связь, и она не должна требовать выхода
 * из продукта в почту. Скромная кнопка в подвале + шторке «Ещё», раскрывает
 * компактную форму по месту; адрес страницы уходит вместе с текстом.
 */
export function FeedbackButton({ variant = 'footer' }: { variant?: 'footer' | 'menu' }) {
  const pathname = usePathname() ?? '/';
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 10) {
      toast(ru.feedbackForm.tooShort, 'danger');
      return;
    }
    setBusy(true);
    const res = await apiFetch('/api/feedback', {
      method: 'POST',
      body: { text: text.trim(), page: pathname },
    });
    setBusy(false);
    if (!res?.ok) {
      toast(res?.status === 429 ? ru.feedbackForm.rateLimited : ru.ui.toastError, 'danger');
      return;
    }
    setText('');
    setOpen(false);
    toast(ru.feedbackForm.sent, 'success');
  }

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={variant === 'menu'
        ? 'block w-full rounded-sm px-4 py-3 text-left t-small text-ink-2 transition-colors hover:bg-surface-2'
        : 't-small muted underline decoration-line underline-offset-2 transition-colors hover:text-ink'}
    >
      {ru.feedbackForm.trigger}
    </button>
  );

  return (
    <div className={variant === 'menu' ? '' : 'inline-block'}>
      {trigger}
      {open && (
        <form onSubmit={submit} className="mt-2 w-full max-w-md rounded-md border border-line bg-surface p-3">
          <label className="field-label" htmlFor="fb-text">{ru.feedbackForm.label}</label>
          <textarea
            id="fb-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={ru.feedbackForm.placeholder}
            className="input mt-1 w-full resize-y py-2 t-small"
          />
          <div className="mt-2 flex items-center gap-2">
            <button type="submit" disabled={busy} className="btn btn-accent btn-sm">
              {ru.feedbackForm.submit}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">
              {ru.ui.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
