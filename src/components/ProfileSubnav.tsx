'use client';

import { useEffect, useState } from 'react';
import { ru } from '@/i18n/ru';

export interface SubnavItem {
  id: string;
  label: string;
}

/**
 * Липкая навигация по разделам профиля (прототип v9).
 *
 * У профиля длинная страница: работы, видео, техника, отзывы, календарь. Без
 * навигации заказчик либо листает всё подряд, либо уходит, не найдя нужного —
 * а фотографу важно, чтобы дошли до цен и занятости. Справа — сводка фактов
 * доверия: она остаётся на экране, пока человек смотрит работы.
 */
export function ProfileSubnav({ items, summary }: { items: SubnavItem[]; summary: string | null }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const sections = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    // Подсвечиваем раздел, верх которого ближе всего к верху экрана
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label={ru.profile.subnavLabel}
      className="sticky top-[53px] z-30 border-b border-line bg-paper/90 backdrop-blur-md sm:top-[57px]">
      <div className="mx-auto flex h-[54px] w-full max-w-6xl items-center gap-7 overflow-x-auto px-4 text-sm ">
        {items.map((i) => (
          <a key={i.id} href={`#${i.id}`} aria-current={active === i.id ? "location" : undefined}
            className={`whitespace-nowrap transition-colors ${active === i.id ? 'text-ink' : 'muted hover:text-ink'}`}>
            {i.label}
          </a>
        ))}
        {summary && (
          <span className="ml-auto hidden shrink-0 text-[13px] muted sm:block">{summary}</span>
        )}
      </div>
    </nav>
  );
}
