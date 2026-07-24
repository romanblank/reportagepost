'use client';

import { useState } from 'react';
import { ru } from '@/i18n/ru';
import { describeApiError } from '@/lib/form-errors';
import { normalizePhone } from '@/lib/phone-format';

interface Option {
  slug: string;
  nameRu: string;
}

interface Prefill { citySlug?: string; categorySlug?: string; photographerName?: string }

export function InquiryForm({ cities, categories, prefill }: { cities: Option[]; categories: Option[]; prefill?: Prefill }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<{ notified: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const budgetRub = String(form.get('budget') ?? '').trim();

    const phoneRaw = String(form.get('contactPhone') ?? '').trim();
    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactName: form.get('contactName'),
        contactPhone: phoneRaw ? normalizePhone(phoneRaw) : undefined,
        contactEmail: String(form.get('contactEmail') ?? '').trim() || undefined,
        citySlug: form.get('citySlug'),
        categorySlug: String(form.get('categorySlug') ?? '') || undefined,
        eventDate: String(form.get('eventDate') ?? '') || undefined,
        budgetMinor: budgetRub ? Math.round(Number(budgetRub) * 100) : undefined,
        description: form.get('description'),
        website: '', // honeypot
      }),
    }).catch(() => null);
    setPending(false);

    if (res?.status === 201) {
      setSent(await res.json());
      return;
    }
    setError(await describeApiError(res, {
      codeLabels: { no_contact: ru.inquiry.errorNoContact },
      fieldLabels: { description: 'описание', contactName: 'имя', contactPhone: 'телефон', contactEmail: 'email' },
      fallback: ru.inquiry.errorGeneric,
    }));
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
        <input name="contactName" required minLength={2} className="input" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {ru.inquiry.contactPhone}
          <input name="contactPhone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 900 000-00-00" className="input" />
        </label>
        <label className="text-sm">
          {ru.inquiry.contactEmail}
          <input name="contactEmail" type="email" className="input" />
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
          <input name="eventDate" type="date" className="input" />
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
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <button type="submit" disabled={pending} className="btn btn-accent">
        {ru.inquiry.submit}
      </button>
    </form>
  );
}
