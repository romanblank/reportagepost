'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ru } from '@/i18n/ru';
import { CATEGORIES } from '@/lib/category-data';
import { RU_CITIES } from '@/lib/geo-data';

/**
 * Два инструмента поиска на первом экране (структура партнёра 2026-08-18):
 *
 * «Быстрый поиск» — город и жанр двумя селектами, дата по желанию, одна
 * кнопка. Минимум кликов для заказчика, который знает, что ему нужно:
 * «фотограф на концерт в Казани в субботу» — три клика до выдачи.
 *
 * «Умный подбор» — бриф своими словами для того, кто приходит с задачей,
 * а не с фильтрами: ИИ-помощник разберёт текст сам.
 *
 * Вкладки, а не два блока: на первом экране должен быть один понятный вход,
 * а не конкурс форм.
 */
export function HeroSearch() {
  const router = useRouter();
  const [mode, setMode] = useState<'quick' | 'smart'>('quick');
  const [text, setText] = useState('');
  const [city, setCity] = useState('moscow');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState('');

  function goSmart(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    router.push(q ? `/ru/match?text=${encodeURIComponent(q)}` : '/ru/match');
  }

  function goQuick(e: React.FormEvent) {
    e.preventDefault();
    const base = category ? `/ru/russia/${city}/${category}` : `/ru/russia/${city}`;
    router.push(date ? `${base}?date=${date}` : base);
  }

  const tabCls = (active: boolean) =>
    `rounded-md px-3.5 py-1.5 t-small transition-colors ${
      active ? 'bg-surface-2 font-semibold text-ink' : 'text-muted hover:text-ink-2'
    }`;

  return (
    <div>
      <div role="tablist" aria-label={ru.landing.searchTabsLabel} className="mb-2 inline-flex gap-1 rounded-md border border-line bg-surface p-1">
        <button type="button" role="tab" aria-selected={mode === 'quick'} className={tabCls(mode === 'quick')}
          onClick={() => setMode('quick')}>
          {ru.landing.quickTab}
        </button>
        <button type="button" role="tab" aria-selected={mode === 'smart'} className={tabCls(mode === 'smart')}
          onClick={() => setMode('smart')}>
          {ru.landing.smartTab}
        </button>
      </div>

      {mode === 'quick' ? (
        <form onSubmit={goQuick}
          className="flex flex-col gap-2 rounded-media border border-line bg-surface p-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 px-2 py-1">
            <span className="t-caption block muted" style={{ fontFamily: 'var(--font-mono)' }}>{ru.landing.quickCity}</span>
            <select value={city} onChange={(e) => setCity(e.target.value)}
              className="mt-0.5 w-full border-0 bg-transparent p-0 text-[15px] outline-none">
              {RU_CITIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.nameRu}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 flex-1 border-line px-2 py-1 sm:border-l sm:pl-4">
            <span className="t-caption block muted" style={{ fontFamily: 'var(--font-mono)' }}>{ru.landing.quickGenre}</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="mt-0.5 w-full border-0 bg-transparent p-0 text-[15px] outline-none">
              <option value="">{ru.landing.quickAnyGenre}</option>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.nameRu}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 border-line px-2 py-1 sm:border-l sm:pl-4">
            <span className="t-caption block muted" style={{ fontFamily: 'var(--font-mono)' }}>{ru.landing.quickDate}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="mt-0.5 w-full border-0 bg-transparent p-0 text-[15px] outline-none" />
          </label>
          <button type="submit" className="btn btn-accent shrink-0 whitespace-nowrap px-6 py-3">
            {ru.landing.quickCta}
          </button>
        </form>
      ) : (
        <form onSubmit={goSmart}
          className="flex flex-col gap-2 rounded-media border border-line bg-surface p-2 sm:flex-row sm:items-center">
          <label className="min-w-0 flex-1 px-3 py-1.5">
            <span className="t-caption block muted" style={{ fontFamily: 'var(--font-mono)' }}>
              {ru.landing.briefLabel}
            </span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={ru.landing.briefPlaceholder}
              aria-label={ru.landing.briefLabel}
              className="mt-0.5 w-full border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-muted-2"
            />
          </label>
          <button type="submit" className="btn btn-accent shrink-0 whitespace-nowrap px-6 py-3">
            {ru.landing.briefCta}
          </button>
        </form>
      )}
    </div>
  );
}
