'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';

// Кнопка «Отправить на повторную проверку» (аудит 2026-07-31, P0): без неё
// отклонённая анкета была тупиком — исправить можно, показать снова нельзя.
export function ResubmitButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const res = await apiFetch('/api/profile/resubmit', {
      method: 'POST',
      codeLabels: ru.cabinet.resubmitErrors,
      fallback: ru.ui.toastError,
    });
    setPending(false);
    if (res?.ok) {
      router.refresh();
      return;
    }
    setError(res.error);
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={submit} disabled={pending} className="btn btn-accent px-4 py-2 text-sm disabled:opacity-50">
        {pending ? ru.ui.loading : ru.cabinet.resubmit}
      </button>
      <p className="mt-1 text-xs muted">{ru.cabinet.resubmitHint}</p>
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
