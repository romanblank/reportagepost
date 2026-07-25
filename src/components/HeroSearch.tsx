'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RU_CITIES } from '@/lib/geo-data';
import { ru } from '@/i18n/ru';
import { Icon } from '@/components/ui/Icon';

// Поиск по городу в герое (директива №1). Селектор города → каталог города.
// Активные города (посев) первыми. Светлый герой: тёмный текст, латунная кнопка.
// Overflow-safe: select min-w-0 flex-1 (сжимается), форма max-w-md, кнопка shrink-0.
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
    <form onSubmit={go}
      className="mx-auto flex w-full max-w-md items-stretch gap-2 rounded-2xl border border-line-2 bg-paper p-1.5 shadow-sm">
      <span className="grid shrink-0 place-items-center pl-2 text-muted-2" aria-hidden>
        <Icon name="search" size={18} />
      </span>
      <select value={city} onChange={(e) => setCity(e.target.value)} aria-label={ru.landing.heroSearchCity}
        className="min-w-0 flex-1 cursor-pointer bg-transparent py-2.5 pr-2 text-[15px] font-medium text-ink outline-none">
        {CITIES.map((c) => (
          <option key={c.slug} value={c.slug}>{c.nameRu}</option>
        ))}
      </select>
      <button type="submit" className="btn btn-accent shrink-0 whitespace-nowrap px-5">{ru.landing.heroSearchCta}</button>
    </form>
  );
}
