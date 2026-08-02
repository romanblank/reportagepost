import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { emailConfigured } from '@/lib/email';
import { verificationRequired } from '@/lib/email-verification';
import { MailCheck } from '@/components/admin/MailCheck';
import { ru } from '@/i18n/ru';

export const metadata: Metadata = { title: ru.adminMail.title };
export const dynamic = 'force-dynamic';

/**
 * Страница проверки почты.
 *
 * Появилась после случая «письмо о подтверждении адреса не приходит»: почта
 * была настроена, отправка молча проваливалась, а увидеть это можно было
 * только в логах контейнера, до которых у оператора нет доступа.
 */
export default async function AdminMailPage() {
  if (!(await requireAdmin())) redirect('/ru/login');

  const configured = emailConfigured();
  const from = process.env.SMTP_FROM ?? 'no-reply@reportagepost.com';
  const host = process.env.SMTP_HOST ?? null;
  // Пока письма не доходят, гейт можно снять переменной EMAIL_GATE=off
  const gateOn = verificationRequired();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <h1 className="t-h2">{ru.adminMail.title}</h1>
      <p className="mt-1 text-sm muted">{ru.adminMail.lead}</p>

      <dl className="mt-6 grid gap-2 rounded-media border border-line bg-surface-2 p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="muted">{ru.adminMail.stateLabel}</dt>
          <dd className={configured ? 'text-verified' : 'text-danger'}>
            {configured ? ru.adminMail.stateOn : ru.adminMail.stateOff}
          </dd>
        </div>
        {/* Хост и адрес отправителя — не секреты, а именно то, что нужно сверить
            с консолью провайдера, когда письма не доходят */}
        <div className="flex justify-between gap-3">
          <dt className="muted">{ru.adminMail.hostLabel}</dt>
          <dd>{host ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="muted">{ru.adminMail.fromLabel}</dt>
          <dd>{from}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="muted">{ru.adminMail.gateLabel}</dt>
          <dd>{gateOn ? ru.adminMail.gateOn : ru.adminMail.gateOff}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <MailCheck />
      </div>

      <section className="mt-8 border-t border-line pt-6">
        <h2 className="t-title">{ru.adminMail.hintsTitle}</h2>
        <ul className="mt-3 grid gap-2 text-sm muted">
          {ru.adminMail.hints.map((h) => <li key={h}>— {h}</li>)}
        </ul>
      </section>
    </main>
  );
}
