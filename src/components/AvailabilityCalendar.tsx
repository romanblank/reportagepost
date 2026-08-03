'use client';

import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

// Календарь занятости фотографа. Клик по дню — toggle занятости (оптимистично,
// откат при ошибке). Прошлые дни недоступны. Даты — 'YYYY-MM-DD' (UTC-полночь на
// сервере), формируем строку из компонентов (без TZ-сдвига).

function ymd(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function AvailabilityCalendar({ initialBusy }: { initialBusy: string[] }) {
  const [busy, setBusy] = useState<Set<string>>(() => new Set(initialBusy));
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<Set<string>>(() => new Set());

  const today = useMemo(() => new Date(), []);
  const todayKey = ymd(today.getFullYear(), today.getMonth(), today.getDate());
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const grid = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const lead = (first.getDay() + 6) % 7; // сдвиг: неделя с понедельника
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const cells: (number | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  async function toggle(key: string) {
    if (pending.has(key)) return;
    const wasBusy = busy.has(key);
    setError(false);
    setBusy((prev) => {
      const next = new Set(prev);
      if (wasBusy) next.delete(key);
      else next.add(key);
      return next;
    });
    setPending((prev) => new Set(prev).add(key));

    const res = await apiFetch('/api/profile/busy', { method: 'POST', body: { date: key } });

    setPending((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

    if (!res?.ok) {
      setError(true);
      setBusy((prev) => {
        const next = new Set(prev); // откат
        if (wasBusy) next.add(key);
        else next.delete(key);
        return next;
      });
    }
  }

  function shift(delta: number) {
    setView((v) => {
      const m = v.month + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }

  // Нельзя листать в прошлые месяцы
  const atCurrentMonth = view.year === today.getFullYear() && view.month === today.getMonth();

  return (
    <div>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} disabled={atCurrentMonth}
          aria-label={ru.availability.prevMonth}
          className="btn btn-outline px-3 min-h-11 min-w-11 py-1.5 text-sm disabled:opacity-40">‹</button>
        <span className="font-medium">{ru.availability.months[view.month]} {view.year}</span>
        <button type="button" onClick={() => shift(1)}
          aria-label={ru.availability.nextMonth}
          className="btn btn-outline px-3 py-1.5 text-sm">›</button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs muted">
        {ru.availability.weekdays.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {grid.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />;
          const key = ymd(view.year, view.month, day);
          const isPast = key < todayKey;
          const isBusy = busy.has(key);
          const isPending = pending.has(key);
          return (
            <button key={key} type="button" disabled={isPast || isPending}
              onClick={() => toggle(key)}
              aria-pressed={isBusy}
              aria-label={`${day} — ${isBusy ? ru.availability.busy : ru.availability.free}`}
              className={[
                'aspect-square rounded-lg text-sm transition',
                isPast ? 'cursor-not-allowed opacity-30' : 'hover:ring-2 hover:ring-accent/40',
                isBusy ? 'bg-accent text-white' : 'bg-surface-2',
                isPending ? 'opacity-60' : '',
              ].join(' ')}>
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm muted">
        <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded bg-accent" />{ru.availability.legendBusy}</span>
        <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded bg-surface-2" />{ru.availability.legendFree}</span>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{ru.availability.saveError}</p>}
    </div>
  );
}
