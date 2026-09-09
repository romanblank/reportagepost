import { unstable_cache } from 'next/cache';

/**
 * Погода в городе автора (партнёр 2026-08-18: «маленькая деталь с заботой» —
 * репортажнику важно быть готовым к погоде и не намочить технику).
 *
 * open-meteo: без ключей и регистрации, некоммерческое использование
 * разрешено. Кэш 30 минут на город — виджет в кабинете не имеет права
 * дёргать внешний API на каждый заход. Любой сбой = null = виджет просто
 * не показывается: погода — забота, а не обязательство.
 */
export interface CityWeather {
  temperatureC: number;
  windMs: number;
  precipitationMm: number;
  /** Код погоды open-meteo (WMO) — сведён к нашей подписи */
  summary: 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm';
}

function summarize(code: number): CityWeather['summary'] {
  if (code === 0 || code === 1) return 'clear';
  if (code >= 95) return 'storm';
  // 85/86 — снеговые ливни (WMO), в «дожде» они путали бы фотографа зимой
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 84)) return 'rain';
  return 'cloudy';
}

async function fetchWeather(lat: number, lon: number): Promise<CityWeather | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,precipitation,weather_code,wind_speed_10m&wind_speed_unit=ms';
    const res = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; precipitation?: number; weather_code?: number; wind_speed_10m?: number };
    };
    const c = data.current;
    if (!c || typeof c.temperature_2m !== 'number') return null;
    return {
      temperatureC: Math.round(c.temperature_2m),
      windMs: Math.round(c.wind_speed_10m ?? 0),
      precipitationMm: c.precipitation ?? 0,
      summary: summarize(c.weather_code ?? 3),
    };
  } catch {
    return null;
  }
}

export async function cityWeather(citySlug: string, lat: number, lon: number): Promise<CityWeather | null> {
  try {
    return await unstable_cache(() => fetchWeather(lat, lon), ['weather', citySlug], { revalidate: 1800 })();
  } catch {
    // Вне request-контекста (скрипты, тесты) у Next нет incrementalCache и
    // unstable_cache бросает — тот же класс граблей, что у revalidateTag.
    // Падать нельзя: погода — забота, а не обязательство
    return fetchWeather(lat, lon);
  }
}
