import { Icon } from '@/components/ui/Icon';

// Рейтинг звёздами. Цвет — INK (не accent: «красные звёзды» = рыночная площадь).
// Полу-звёзды, число tabular-nums. Чистый компонент (сервер и клиент).

export function Rating({
  value,
  count,
  size = 'sm',
  showCount = true,
}: {
  value: number; // 0..5
  count?: number;
  size?: 'sm' | 'lg';
  showCount?: boolean;
}) {
  const px = size === 'lg' ? 20 : 15;
  const rounded = Math.round(value * 2) / 2; // до полузвезды
  const stars = Array.from({ length: 5 }, (_, i) => {
    const n = i + 1;
    if (rounded >= n) return 'star-filled' as const;
    if (rounded >= n - 0.5) return 'star-half' as const;
    return 'star' as const;
  });
  return (
    <span className="inline-flex items-center gap-1.5 text-ink">
      <span className="inline-flex" aria-hidden="true">
        {stars.map((s, i) => (
          <Icon key={i} name={s} size={px} />
        ))}
      </span>
      {showCount && (
        <span className="tnum text-sm">
          <b className="font-semibold">{value.toFixed(1)}</b>
          {count != null && <span className="muted"> ({count})</span>}
        </span>
      )}
    </span>
  );
}
