// Единый источник гео-данных РФ: сид БД и отображение имён берут отсюда.
// slug — для ЧПУ (/ru/russia/moscow-…); nameRu — отображение (локаль ru).
// active в БД получают только города посева (Мск, СПб) — SEO-страницы
// генерируются для всех, но под noindex до S4.

export const RU_COUNTRY = { code: 'RU', slug: 'russia', nameRu: 'Россия' } as const;

export interface CitySeed {
  /** Координаты для погоды в кабинете (2026-08-18); хватает двух знаков */
  lat?: number;
  lon?: number;
  slug: string;
  nameRu: string;
  active?: boolean;
}

export const RU_CITIES: CitySeed[] = [
  { slug: 'moscow', nameRu: 'Москва', active: true, lat: 55.76, lon: 37.62 },
  { slug: 'saint-petersburg', nameRu: 'Санкт-Петербург', active: true, lat: 59.94, lon: 30.31 },
  { slug: 'novosibirsk', nameRu: 'Новосибирск', lat: 55.03, lon: 82.92 },
  { slug: 'yekaterinburg', nameRu: 'Екатеринбург', lat: 56.84, lon: 60.65 },
  { slug: 'kazan', nameRu: 'Казань', lat: 55.8, lon: 49.11 },
  { slug: 'nizhny-novgorod', nameRu: 'Нижний Новгород', lat: 56.33, lon: 44.0 },
  { slug: 'chelyabinsk', nameRu: 'Челябинск', lat: 55.16, lon: 61.4 },
  { slug: 'samara', nameRu: 'Самара', lat: 53.2, lon: 50.15 },
  { slug: 'omsk', nameRu: 'Омск', lat: 54.99, lon: 73.37 },
  { slug: 'rostov-on-don', nameRu: 'Ростов-на-Дону', lat: 47.23, lon: 39.72 },
  { slug: 'ufa', nameRu: 'Уфа', lat: 54.74, lon: 55.97 },
  { slug: 'krasnoyarsk', nameRu: 'Красноярск', lat: 56.01, lon: 92.87 },
  { slug: 'voronezh', nameRu: 'Воронеж', lat: 51.66, lon: 39.2 },
  { slug: 'perm', nameRu: 'Пермь', lat: 58.01, lon: 56.25 },
  { slug: 'volgograd', nameRu: 'Волгоград', lat: 48.71, lon: 44.51 },
  { slug: 'krasnodar', nameRu: 'Краснодар', lat: 45.04, lon: 38.98 },
  { slug: 'saratov', nameRu: 'Саратов', lat: 51.53, lon: 46.03 },
  { slug: 'tyumen', nameRu: 'Тюмень', lat: 57.15, lon: 65.53 },
  { slug: 'tolyatti', nameRu: 'Тольятти', lat: 53.51, lon: 49.42 },
  { slug: 'izhevsk', nameRu: 'Ижевск', lat: 56.85, lon: 53.21 },
  { slug: 'barnaul', nameRu: 'Барнаул', lat: 53.35, lon: 83.78 },
  { slug: 'ulyanovsk', nameRu: 'Ульяновск', lat: 54.31, lon: 48.4 },
  { slug: 'irkutsk', nameRu: 'Иркутск', lat: 52.29, lon: 104.28 },
  { slug: 'khabarovsk', nameRu: 'Хабаровск', lat: 48.48, lon: 135.08 },
  { slug: 'yaroslavl', nameRu: 'Ярославль', lat: 57.63, lon: 39.87 },
  { slug: 'vladivostok', nameRu: 'Владивосток', lat: 43.12, lon: 131.89 },
  { slug: 'makhachkala', nameRu: 'Махачкала', lat: 42.98, lon: 47.5 },
  { slug: 'tomsk', nameRu: 'Томск', lat: 56.49, lon: 84.95 },
  { slug: 'orenburg', nameRu: 'Оренбург', lat: 51.77, lon: 55.1 },
  { slug: 'kemerovo', nameRu: 'Кемерово', lat: 55.35, lon: 86.09 },
  { slug: 'novokuznetsk', nameRu: 'Новокузнецк', lat: 53.76, lon: 87.11 },
  { slug: 'ryazan', nameRu: 'Рязань', lat: 54.63, lon: 39.74 },
  { slug: 'astrakhan', nameRu: 'Астрахань', lat: 46.35, lon: 48.04 },
  { slug: 'naberezhnye-chelny', nameRu: 'Набережные Челны', lat: 55.74, lon: 52.4 },
  { slug: 'penza', nameRu: 'Пенза', lat: 53.2, lon: 45.0 },
  { slug: 'lipetsk', nameRu: 'Липецк', lat: 52.61, lon: 39.6 },
  { slug: 'kirov', nameRu: 'Киров', lat: 58.6, lon: 49.66 },
  { slug: 'cheboksary', nameRu: 'Чебоксары', lat: 56.13, lon: 47.25 },
  { slug: 'tula', nameRu: 'Тула', lat: 54.19, lon: 37.62 },
  { slug: 'kaliningrad', nameRu: 'Калининград', lat: 54.71, lon: 20.51 },
  { slug: 'kursk', nameRu: 'Курск', lat: 51.73, lon: 36.19 },
  { slug: 'stavropol', nameRu: 'Ставрополь', lat: 45.04, lon: 41.97 },
  { slug: 'ulan-ude', nameRu: 'Улан-Удэ', lat: 51.83, lon: 107.58 },
  { slug: 'tver', nameRu: 'Тверь', lat: 56.86, lon: 35.91 },
  { slug: 'magnitogorsk', nameRu: 'Магнитогорск', lat: 53.41, lon: 58.98 },
  { slug: 'sochi', nameRu: 'Сочи', lat: 43.6, lon: 39.73 },
  { slug: 'ivanovo', nameRu: 'Иваново', lat: 57.0, lon: 40.97 },
  { slug: 'bryansk', nameRu: 'Брянск', lat: 53.24, lon: 34.36 },
  { slug: 'belgorod', nameRu: 'Белгород', lat: 50.6, lon: 36.59 },
  { slug: 'surgut', nameRu: 'Сургут', lat: 61.25, lon: 73.4 },
  { slug: 'vladimir', nameRu: 'Владимир', lat: 56.13, lon: 40.4 },
  { slug: 'chita', nameRu: 'Чита', lat: 52.03, lon: 113.5 },
  { slug: 'arkhangelsk', nameRu: 'Архангельск', lat: 64.54, lon: 40.54 },
  { slug: 'kaluga', nameRu: 'Калуга', lat: 54.51, lon: 36.26 },
  { slug: 'smolensk', nameRu: 'Смоленск', lat: 54.78, lon: 32.05 },
  { slug: 'volzhsky', nameRu: 'Волжский', lat: 48.79, lon: 44.75 },
  { slug: 'murmansk', nameRu: 'Мурманск', lat: 68.97, lon: 33.07 },
  { slug: 'vologda', nameRu: 'Вологда', lat: 59.22, lon: 39.89 },
  { slug: 'yakutsk', nameRu: 'Якутск', lat: 62.03, lon: 129.73 },
  { slug: 'podolsk', nameRu: 'Подольск', lat: 55.43, lon: 37.55 },
];

const cityBySlug = new Map(RU_CITIES.map((c) => [c.slug, c]));

/** Имя города для отображения (локаль ru). nameKey в БД: geo.city.<slug>. */
export function cityNameRu(slug: string): string {
  return cityBySlug.get(slug)?.nameRu ?? slug;
}
