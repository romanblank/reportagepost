'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { CATEGORIES } from '@/lib/category-data';

/**
 * Главное действие на первом экране — умный подбор по описанию события
 * (прототип v9). Раньше здесь стоял выбор города из списка и кнопка «Найти».
 *
 * Разница принципиальная: заказчик приходит с задачей — «корпоратив в Москве,
 * 200 гостей, репортаж без постановки», — а не со знанием, кого и где искать.
 * Список городов заставлял его сначала перевести задачу в наш способ навигации.
 * Поле брифа принимает задачу как есть и отдаёт её подбору.
 *
 * Жанры остаются рядом отдельной строкой: если человек точно знает, что ему
 * нужны «Концерты», незачем заставлять его формулировать.
 */
export function HeroSearch() {
  const router = useRouter();
  const [text, setText] = useState('');

  function go(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    router.push(q ? `/ru/match?text=${encodeURIComponent(q)}` : '/ru/match');
  }

  return (
    <div>
      <form onSubmit={go}
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

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="muted">{ru.landing.briefOrGenre}</span>
        {CATEGORIES.map((c) => (
          <Link key={c.slug} href={`/ru/russia/moscow/${c.slug}`} className="chip">
            {c.nameRu}
          </Link>
        ))}
      </div>
    </div>
  );
}
