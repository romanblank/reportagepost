'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { normalizePhone } from '@/lib/phone-format';

interface Option {
  slug: string;
  nameRu: string;
}

interface Prefill { citySlug?: string; categorySlug?: string; photographerName?: string }
interface ContactPrefill { name?: string; email?: string }

export function InquiryForm({ cities, categories, prefill, contact }: { cities: Option[]; categories: Option[]; prefill?: Prefill; contact?: ContactPrefill }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<{ notified: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  // Дата события — не раньше сегодня. Считаем в рендере (клиентский компонент;
  // hydration-расхождение возможно лишь на самой полночи — некритично для min-атрибута).
  const minDate = new Date().toISOString().slice(0, 10);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Согласие на обработку ПДн обязательно (аудит 2026-07-31, P0): форма
    // собирает имя/телефон/почту гостя — без согласия обработка неправомерна.
    if (!consent) { setError(ru.inquiry.consentRequired); return; }
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const budgetRub = String(form.get('budget') ?? '').trim();

    const phoneRaw = String(form.get('contactPhone') ?? '').trim();
    const res = await apiFetch('/api/inquiries', { method: 'POST', body: {
        contactName: form.get('contactName'),
        contactPhone: phoneRaw ? normalizePhone(phoneRaw) : undefined,
        contactEmail: String(form.get('contactEmail') ?? '').trim() || undefined,
        citySlug: form.get('citySlug'),
        categorySlug: String(form.get('categorySlug') ?? '') || undefined,
        eventDate: String(form.get('eventDate') ?? '') || undefined,
        budgetMinor: budgetRub ? Math.round(Number(budgetRub) * 100) : undefined,
        description: form.get('description'),
        pdnConsent: consent,
        website: '', // honeypot
      },
      // Карты человеческих текстов уходят в слой — он же и разбирает ответ
      codeLabels: { no_contact: ru.inquiry.errorNoContact },
      fieldLabels: ru.inquiry.fieldLabels,
      fallback: ru.inquiry.errorGeneric,
    });
    setPending(false);

    if (res.ok) {
      setSent(res.data as { notified: number });
      return;
    }
    setError(res.error);
  }

  if (sent) {
    return (
      <p role="status" className="card border-accent/40 bg-accent/5 p-4 text-sm">
        {ru.inquiry.sent} {sent.notified > 0 && ru.inquiry.sentNotified(sent.notified)}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {prefill?.photographerName && (
        <p className="card border-recognition/40 bg-recognition-soft/30 p-3 text-sm">
          {ru.inquiry.forPhotographer(prefill.photographerName)}
        </p>
      )}
      <label className="text-sm">
        {ru.inquiry.contactName}
        <input name="contactName" required minLength={2} defaultValue={contact?.name ?? ''} className="input"  autoComplete="name"/>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {ru.inquiry.contactPhone}
          <input name="contactPhone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 900 000-00-00" className="input" />
        </label>
        <label className="text-sm">
          {ru.inquiry.contactEmail}
          <input name="contactEmail" type="email" defaultValue={contact?.email ?? ''} className="input"  autoComplete="email"/>
        </label>
      </div>
      <p className="text-xs muted">{ru.inquiry.contactHint}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {ru.inquiry.city}
          <select name="citySlug" required className="input" defaultValue={prefill?.citySlug ?? ''}>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>{c.nameRu}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {ru.inquiry.category}
          <select name="categorySlug" className="input" defaultValue={prefill?.categorySlug ?? ''}>
            <option value="">{ru.inquiry.categoryAny}</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.nameRu}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {ru.inquiry.eventDate}
          <input name="eventDate" type="date" min={minDate || undefined} className="input" />
        </label>
        <label className="text-sm">
          {ru.inquiry.budget}
          <input name="budget" type="number" min={0} step={1} inputMode="numeric" className="input" />
        </label>
      </div>
      <label className="text-sm">
        {ru.inquiry.description}
        <textarea name="description" required minLength={20} rows={4} className="input" />
      </label>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
        <span className="muted">
          {ru.inquiry.consentText}{' '}
          <Link href="/ru/legal/privacy" target="_blank" className="underline hover:text-ink">
            {ru.inquiry.consentPolicyLink}
          </Link>
        </span>
      </label>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <button type="submit" disabled={pending} className="btn btn-accent">
        {ru.inquiry.submit}
      </button>
    </form>
  );
}
