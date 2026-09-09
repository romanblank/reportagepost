import { cityWeather } from '@/lib/weather';
import { cityNameRu } from '@/lib/geo-data';
import { ru } from '@/i18n/ru';

/**
 * Погода в городе автора — деталь-забота (партнёр 2026-08-18): репортажнику
 * важно быть готовым к погоде и не намочить технику. Сбой погодного API —
 * виджет просто не рендерится: забота не имеет права ломать кабинет.
 */
export async function WeatherWidget({
  citySlug, lat, lon,
}: {
  citySlug: string;
  lat: number | null;
  lon: number | null;
}) {
  if (lat == null || lon == null) return null;
  const w = await cityWeather(citySlug, lat, lon);
  if (!w) return null;
  const t = ru.weather;

  return (
    <p className="t-fine muted">
      {cityNameRu(citySlug)}: {w.temperatureC > 0 ? `+${w.temperatureC}` : w.temperatureC}°
      {' · '}{t.summary[w.summary]}
      {w.windMs >= 8 ? ` · ${t.wind(w.windMs)}` : ''}
      {w.summary === 'rain' || w.summary === 'storm' ? ` — ${t.gearHint}` : ''}
    </p>
  );
}
