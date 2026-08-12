'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

type Result =
  | { ok: true; to: string }
  | { ok: false; stage: 'config' | 'connect' | 'send'; error: string; to?: string };

/**
 * Кнопка проверки почты. Показывает не «что-то пошло не так», а стадию и
 * дословный отказ SMTP: именно он отличает неподтверждённый домен от песочницы
 * провайдера и от неверного пароля.
 */
export function MailCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    const res = await apiFetch<Result>('/api/admin/mail-test', { method: 'POST', timeoutMs: 60_000 });
    setBusy(false);
    setResult(res.ok ? res.data : { ok: false, stage: 'send', error: res.error });
  }

  return (
    <div>
      <button type="button" onClick={run} disabled={busy} className="btn btn-primary">
        {busy ? ru.adminMail.checking : ru.adminMail.checkCta}
      </button>

      {result && (
        <div className="mt-4 rounded-media border border-line bg-surface-2 p-4 t-small">
          {result.ok ? (
            <p className="text-verified">{ru.adminMail.sentTo(result.to)}</p>
          ) : (
            <>
              <p className="text-danger">{ru.adminMail.stageLabel(result.stage)}</p>
              <p className="mt-2 break-words font-mono text-[12.5px] muted">{result.error}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
