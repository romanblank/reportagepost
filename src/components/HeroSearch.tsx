'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RU_CITIES } from '@/lib/geo-data';
import { ru } from '@/i18n/ru';

// Поиск по городу в герое (директива №1). Селектор города → каталог города.
// Активные города (посев) первыми. Стеклянная строка на тёмном скриме — search-
// first без потери editorial.
const CITIES = [...RU_CITIES].sort(
  (a, b) => Number(b.active ?? false) - Number(a.active ?? false) || a.nameRu.localeCompare(b.nameRu, 'ru'),
);

export function HeroSearch() {
  const router = useRouter();
  const [city, setCity] = useState('moscow');

  function go(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/ru/russia/${city}`);
  }

  return (
    <form onSubmit={go} className="hs">
      <select value={city} onChange={(e) => setCity(e.target.value)} aria-label={ru.landing.heroSearchCity} className="hs-city">
        {CITIES.map((c) => (
          <option key={c.slug} value={c.slug}>{c.nameRu}</option>
        ))}
      </select>
      <button type="submit" className="hs-go">{ru.landing.heroSearchCta}</button>
      <style>{`
        .hs {
          display: flex; gap: 8px; align-items: stretch; width: 100%; max-width: 460px;
          background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.28);
          border-radius: 14px; padding: 7px; backdrop-filter: blur(10px);
        }
        .hs-city {
          flex: 1; min-width: 0; background: transparent; border: 0; color: #fff;
          font-size: 16px; font-weight: 500; padding: 10px 12px; outline: none; cursor: pointer;
        }
        .hs-city option { color: #14151a; }
        .hs-go {
          background: var(--accent); color: #fff; border: 0; border-radius: 9px;
          font-weight: 600; font-size: 15px; padding: 0 22px; cursor: pointer; white-space: nowrap;
          transition: filter .2s;
        }
        .hs-go:hover { filter: brightness(1.08); }
      `}</style>
    </form>
  );
}
