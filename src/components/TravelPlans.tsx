'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';
import { cityNameRu } from '@/lib/geo-data';

// Управление выездными графиками фотографа: добавить/убрать период работы в
// чужом городе. Список — локальное состояние (append/remove), сервер валидирует.

interface Plan {
  id: string;
  citySlug: string;
  fromDate: string;
  toDate: string;
}

export function TravelPlans({
  initialPlans,
  cities,
}: {
  initialPlans: Plan[];
  cities: { slug: string; name: string }[];
}) {
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [citySlug, setCitySlug] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function add() {
    if (!citySlug) return setError(ru.travel.errCity);
    if (fromDate && toDate && toDate < fromDate) return setError(ru.travel.errDates);
    setError(null);
    setPending(true);
    const res = await apiFetch('/api/profile/travel', { method: 'POST', body: { citySlug, fromDate, toDate } });
    setPending(false);
    if (!res?.ok) return setError(ru.travel.errSave);
    const { id } = res.data as { id: string };
    setPlans((prev) =>
      [...prev, { id, citySlug, fromDate, toDate }].sort((a, b) => a.fromDate.localeCompare(b.fromDate)),
    );
    setCitySlug('');
    setFromDate('');
    setToDate('');
  }

  async function remove(id: string) {
    const prev = plans;
    setPlans((p) => p.filter((x) => x.id !== id)); // оптимистично
    const res = await apiFetch('/api/profile/travel', { method: 'DELETE', body: { id } });
    if (!res?.ok) {
      setPlans(prev); // откат
      setError(ru.travel.errSave);
    }
  }

  return (
    <div>
      {plans.length === 0 ? (
        <p className="text-sm muted">{ru.travel.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {plans.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-media bg-surface-2 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{cityNameRu(p.citySlug)}</span>{' '}
                <span className="muted">{ru.travel.rangeLabel(p.fromDate, p.toDate)}</span>
              </span>
              <button type="button" onClick={() => remove(p.id)}
                className="text-xs muted underline transition hover:text-accent">{ru.travel.remove}</button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <label className="field-hint">{ru.travel.city}
          <select value={citySlug} onChange={(e) => setCitySlug(e.target.value)}
            className="input mt-1 w-full">
            <option value="">{ru.travel.cityPlaceholder}</option>
            {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <label className="field-hint flex-1">{ru.travel.from}
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input mt-1 w-full" />
          </label>
          <label className="field-hint flex-1">{ru.travel.to}
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input mt-1 w-full" />
          </label>
        </div>
        <button type="button" onClick={add} disabled={pending}
          className="btn btn-outline mt-1 w-fit px-4 py-1.5 text-sm">
          {pending ? ru.travel.adding : ru.travel.add}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
