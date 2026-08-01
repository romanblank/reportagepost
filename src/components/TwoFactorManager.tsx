'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';
import { useToast } from '@/components/ui/Toast';

type Status = { enabled: boolean; recoveryLeft: number };

export function TwoFactorManager({ initial }: { initial: Status }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(initial);
  const [step, setStep] = useState<'idle' | 'enroll' | 'backup' | 'disable'>('idle');
  const [secret, setSecret] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function begin() {
    setBusy(true); setError(null);
    const res = await apiFetch('/api/auth/2fa/enroll', { method: 'POST' });
    setBusy(false);
    if (!res.ok) return toast(res.error, 'danger');
    setSecret((res.data as { secret: string }).secret);
    setStep('enroll');
  }

  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const code = new FormData(e.currentTarget).get('code');
    const res = await apiFetch('/api/auth/2fa/enroll', { method: 'POST', body: { action: 'confirm', code } });
    setBusy(false);
    if (!res.ok) { setError(ru.auth.twoFa.badCode); return; }
    const { recoveryCodes } = res.data as { recoveryCodes: string[] };
    setCodes(recoveryCodes);
    setStep('backup');
    setStatus({ enabled: true, recoveryLeft: recoveryCodes.length });
  }

  async function disable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const code = new FormData(e.currentTarget).get('code');
    const res = await apiFetch('/api/auth/2fa/enroll', { method: 'POST', body: { action: 'disable', code } });
    setBusy(false);
    if (!res?.ok) { setError(ru.auth.twoFa.badCode); return; }
    setStatus({ enabled: false, recoveryLeft: 0 });
    setStep('idle');
    toast(ru.auth.twoFa.statusOff, 'success');
  }

  // Форматируем секрет группами по 4 для ручного ввода
  const prettySecret = secret.replace(/(.{4})/g, '$1 ').trim();

  if (step === 'backup') {
    return (
      <div>
        <h3 className="t-h3">{ru.auth.twoFa.backupTitle}</h3>
        <p className="mt-2 text-sm muted">{ru.auth.twoFa.backupLead}</p>
        <ul className="tnum mt-4 grid grid-cols-2 gap-2 font-mono text-sm">
          {codes.map((c) => <li key={c} className="rounded-md bg-surface-2 px-3 py-2 text-center">{c}</li>)}
        </ul>
        <button type="button" onClick={() => setStep('idle')} className="btn btn-accent mt-5">{ru.auth.twoFa.backupDone}</button>
      </div>
    );
  }

  if (step === 'enroll') {
    return (
      <div>
        <h3 className="t-h3">{ru.auth.twoFa.title}</h3>
        <p className="mt-2 text-sm muted">{ru.auth.twoFa.step1}</p>
        <div className="mt-3">
          <span className="field-hint">{ru.auth.twoFa.manualKey}</span>
          <code className="tnum mt-1 block rounded-md bg-surface-2 px-3 py-2 font-mono text-sm tracking-wider">{prettySecret}</code>
        </div>
        <form onSubmit={confirm} className="mt-5 flex flex-col gap-3">
          <p className="text-sm muted">{ru.auth.twoFa.step2}</p>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder={ru.auth.twoFa.codePlaceholder}
            className="input tnum w-40 text-center text-lg tracking-[0.3em]" />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn btn-accent">{ru.auth.twoFa.confirm}</button>
            <button type="button" onClick={() => setStep('idle')} className="btn btn-ghost">{ru.ui.cancel}</button>
          </div>
        </form>
      </div>
    );
  }

  if (step === 'disable') {
    return (
      <form onSubmit={disable} className="flex flex-col gap-3">
        <h3 className="t-h3">{ru.auth.twoFa.title}</h3>
        <p className="text-sm muted">{ru.auth.twoFa.disableLead}</p>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder={ru.auth.twoFa.enterCode}
          className="input w-48 text-center tracking-wider" />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="btn btn-danger">{ru.auth.twoFa.disable}</button>
          <button type="button" onClick={() => setStep('idle')} className="btn btn-ghost">{ru.ui.cancel}</button>
        </div>
      </form>
    );
  }

  // idle
  return (
    <div>
      <div className="flex items-center gap-3">
        <h3 className="t-h3">{ru.auth.twoFa.title}</h3>
        <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${status.enabled ? 'bg-success-soft text-success' : 'bg-surface-2 muted'}`}>
          {status.enabled ? ru.auth.twoFa.statusOn : ru.auth.twoFa.statusOff}
        </span>
      </div>
      <p className="mt-2 text-sm muted">{ru.auth.twoFa.leadOff}</p>
      {status.enabled ? (
        <div className="mt-4 flex items-center gap-4">
          <span className="text-sm muted">{ru.auth.twoFa.recoveryLeft(status.recoveryLeft)}</span>
          <button type="button" onClick={() => { setError(null); setStep('disable'); }} className="btn btn-danger btn-sm">{ru.auth.twoFa.disable}</button>
        </div>
      ) : (
        <button type="button" onClick={begin} disabled={busy} className="btn btn-accent mt-4">{ru.auth.twoFa.enable}</button>
      )}
    </div>
  );
}
