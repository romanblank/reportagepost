'use client';

import { useState } from 'react';
import { ru } from '@/i18n/ru';

interface Option {
  slug: string;
  nameRu: string;
}

export function InquiryForm({ cities, categories }: { cities: Option[]; categories: Option[] }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<{ notified: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const budgetRub = String(form.get('budget') ?? '').trim();

    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactName: form.get('contactName'),
        contactPhone: String(form.get('contactPhone') ?? '').trim() || undefined,
        contactEmail: String(form.get('contactEmail') ?? '').trim() || undefined,
        citySlug: form.get('citySlug'),
        categorySlug: String(form.get('categorySlug') ?? '') || undefined,
        eventDate: String(form.get('eventDate') ?? '') || undefined,
        budgetMinor: budgetRub ? Number(budgetRub) * 100 : undefined,
        description: form.get('description'),
        website: '', // honeypot
      }),
    }).catch(() => null);
    setPending(false);

    if (res?.status === 201) {
      setSent(await res.json());
      return;
    }
    const body = res ? await res.json().catch(() => null) : null;
    setError(body?.error === 'no_contact' ? ru.inquiry.errorNoContact : ru.inquiry.errorGeneric);
  }

  if (sent) {
    return (
      <p role="status" className="rounded-lg border border-green-600 p-4">
        {ru.inquiry.sent} {sent.notified > 0 && ru.inquiry.sentNotified(sent.notified)}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="text-sm">
        {ru.inquiry.contactName}
        <input name="contactName" required minLength={2} className="mt-1 w-full rounded-lg border px-3 py-2" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {ru.inquiry.contactPhone}
          <input name="contactPhone" type="tel" pattern="\+[1-9][0-9]{7,14}" className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm">
          {ru.inquiry.contactEmail}
          <input name="contactEmail" type="email" className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
      </div>
      <p className="text-xs opacity-60">{ru.inquiry.contactHint}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {ru.inquiry.city}
          <select name="citySlug" required className="mt-1 w-full rounded-lg border px-3 py-2">
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>{c.nameRu}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {ru.inquiry.category}
          <select name="categorySlug" className="mt-1 w-full rounded-lg border px-3 py-2">
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
          <input name="eventDate" type="date" className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm">
          {ru.inquiry.budget}
          <input name="budget" type="number" min={0} step={1000} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
      </div>
      <label className="text-sm">
        {ru.inquiry.description}
        <textarea name="description" required minLength={20} rows={4} className="mt-1 w-full rounded-lg border px-3 py-2" />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending} className="rounded-lg bg-foreground px-4 py-2 text-background disabled:opacity-50">
        {ru.inquiry.submit}
      </button>
    </form>
  );
}
