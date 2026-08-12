'use client';

import { useRouter } from 'next/navigation';
import { RU_CITIES } from '@/lib/geo-data';
import { ru } from '@/i18n/ru';

/**
 * Выбор города в панели фильтров.
 *
 * Раньше здесь стоял `<select>` в форме без кнопки отправки — контрол,
 * который выглядел рабочим и не делал ничего. Теперь выбор сразу ведёт на
 * страницу города: одно действие вместо «выбрал и ищи, чем подтвердить».
 *
 * Список городов длинный, поэтому именно select, а не столбец ссылок: шесть
 * десятков пунктов в боковой панели читались бы хуже, чем один свёрнутый
 * список. Переход выполняется по изменению значения — событие, доступное и с
 * клавиатуры.
 */
export function CitySelect({ countrySlug, activeCity }: { countrySlug: string; activeCity: string }) {
  const router = useRouter();
  return (
    <select
      value={activeCity}
      aria-label={ru.catalog.filterCity}
      onChange={(e) => router.push(`/ru/${countrySlug}/${e.target.value}`)}
      className="input w-full t-small"
    >
      {RU_CITIES.map((c) => (
        <option key={c.slug} value={c.slug}>{c.nameRu}</option>
      ))}
    </select>
  );
}
