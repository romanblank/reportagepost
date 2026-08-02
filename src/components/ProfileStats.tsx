import { ru } from '@/i18n/ru';

export interface StatItem {
  /** Крупное число — набирается антиквой */
  value: string;
  /** Мелкая приписка к числу: «ч», «лет» */
  unit?: string;
  label: string;
  /** Подсветить как факт признания */
  accent?: boolean;
}

/**
 * Статистика автора (прототип v9): крупные числа антиквой в единой рамке.
 *
 * Эти факты — подтверждённые съёмки, вернувшиеся заказчики, стаж, объём
 * портфолио — раньше либо не показывались вовсе, либо шли мелкой строкой среди
 * прочего. Между тем именно они отвечают на вопрос «стоит ли доверять», и в
 * доброжелательной системе заменяют собой звёздный рейтинг: не оценка, а факты.
 */
export function ProfileStats({ items }: { items: StatItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-media border border-line bg-line sm:grid-cols-3">
      {items.map((s) => (
        <div key={s.label} className="bg-paper px-5 py-5">
          <p className={`tnum text-3xl leading-none ${s.accent ? 'text-recognition' : ''}`}
            style={{ fontFamily: 'var(--font-display)' }}>
            {s.value}
            {s.unit && <small className="ml-1 text-[15px] muted">{s.unit}</small>}
          </p>
          <p className="mt-2 text-[12.5px] muted">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

export interface GearGroup {
  title: string;
  items: { name: string; note?: string }[];
}

/**
 * Техника автора (прототип v9): камеры, оптика, свет, видео — карточками.
 *
 * Раньше это была строка «Камеры: … Оптика: …» через запятую. Для событийной
 * съёмки парк техники — профессиональный аргумент (второй корпус, светосильная
 * оптика, свет, стабилизация), и заказчик, который в этом разбирается, читает
 * его первым. Списком с подписями он читается, строкой — нет.
 */
export function ProfileGear({ groups }: { groups: GearGroup[] }) {
  const filled = groups.filter((g) => g.items.length > 0);
  if (filled.length === 0) return null;
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {filled.map((g) => (
        <div key={g.title} className="card p-5">
          <p className="t-caption" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{g.title}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {g.items.map((it, i) => (
              <li key={`${it.name}-${i}`}
                className={`flex justify-between gap-3 text-sm ${i < g.items.length - 1 ? 'border-b border-line pb-2' : ''}`}>
                <span>{it.name}</span>
                {it.note && <span className="shrink-0 text-[12.5px] muted">{it.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Подтверждённые съёмки (прототип v9) — три факта крупно.
 * Публичный сигнал доверия вместо среднего балла: съёмки состоялись, заказчики
 * вернулись, отзывы оставлены за реальную работу.
 */
export function ConfirmedShoots({ count, returning, verifiedShare }: {
  count: number;
  returning: number;
  verifiedShare: number | null;
}) {
  if (count === 0) return null;
  const cards = [
    { n: ru.profile.shootsCount(count), l: ru.profile.shootsCountHint },
    { n: ru.profile.shootsReturning(returning), l: ru.profile.shootsReturningHint },
    ...(verifiedShare != null
      ? [{ n: `${verifiedShare}%`, l: ru.profile.shootsVerifiedHint }]
      : []),
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {cards.map((c) => (
        <div key={c.l} className="card min-w-[200px] flex-1 p-5">
          <p className="text-2xl" style={{ fontFamily: 'var(--font-display)' }}>{c.n}</p>
          <p className="mt-1.5 text-[13px] muted">{c.l}</p>
        </div>
      ))}
    </div>
  );
}
