import { ru } from '@/i18n/ru';
import type { PhotographerStats } from '@/lib/analytics';

// Дашборд статистики для подписчиков (ценность Prime/Elite). Серверный компонент,
// чистое отображение. Elite видит тренд за 30 дней.
export function CabinetStats({ stats, tier }: { stats: PhotographerStats; tier: 'PRIME' | 'ELITE' }) {
  const items = [
    { label: ru.cabinet.statViews, value: stats.views },
    { label: ru.cabinet.statSaves, value: stats.saves },
    { label: ru.cabinet.statFollowers, value: stats.followers },
    { label: ru.cabinet.statLikes, value: stats.likes },
    { label: ru.cabinet.statReviews, value: stats.reviews },
    { label: ru.cabinet.statPhoneReveals, value: stats.phoneReveals30d },
  ];
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <p className="t-caption text-recognition">{ru.cabinet.statsTitle}</p>
        <span className="rounded-sm bg-recognition-soft px-2 py-0.5 t-fine font-medium text-recognition">{ru.pro.tierName[tier]}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((it) => (
          <div key={it.label} className="rounded-media bg-surface-2 p-3">
            <p className="tnum t-metric-sm">{it.value}</p>
            <p className="mt-0.5 t-fine muted">{it.label}</p>
          </div>
        ))}
      </div>
      {tier === 'ELITE' && (stats.views30d > 0 || stats.saves30d > 0) && (
        <p className="mt-3 t-small text-recognition">{ru.cabinet.statTrend30d(stats.views30d, stats.saves30d)}</p>
      )}
    </section>
  );
}
