// Единый источник гео-данных РФ: сид БД и отображение имён берут отсюда.
// slug — для ЧПУ (/ru/russia/moscow-…); nameRu — отображение (локаль ru).
// active в БД получают только города посева (Мск, СПб) — SEO-страницы
// генерируются для всех, но под noindex до S4.

export const RU_COUNTRY = { code: 'RU', slug: 'russia', nameRu: 'Россия' } as const;

export interface CitySeed {
  slug: string;
  nameRu: string;
  active?: boolean;
}

export const RU_CITIES: CitySeed[] = [
  { slug: 'moscow', nameRu: 'Москва', active: true },
  { slug: 'saint-petersburg', nameRu: 'Санкт-Петербург', active: true },
  { slug: 'novosibirsk', nameRu: 'Новосибирск' },
  { slug: 'yekaterinburg', nameRu: 'Екатеринбург' },
  { slug: 'kazan', nameRu: 'Казань' },
  { slug: 'nizhny-novgorod', nameRu: 'Нижний Новгород' },
  { slug: 'chelyabinsk', nameRu: 'Челябинск' },
  { slug: 'samara', nameRu: 'Самара' },
  { slug: 'omsk', nameRu: 'Омск' },
  { slug: 'rostov-on-don', nameRu: 'Ростов-на-Дону' },
  { slug: 'ufa', nameRu: 'Уфа' },
  { slug: 'krasnoyarsk', nameRu: 'Красноярск' },
  { slug: 'voronezh', nameRu: 'Воронеж' },
  { slug: 'perm', nameRu: 'Пермь' },
  { slug: 'volgograd', nameRu: 'Волгоград' },
  { slug: 'krasnodar', nameRu: 'Краснодар' },
  { slug: 'saratov', nameRu: 'Саратов' },
  { slug: 'tyumen', nameRu: 'Тюмень' },
  { slug: 'tolyatti', nameRu: 'Тольятти' },
  { slug: 'izhevsk', nameRu: 'Ижевск' },
  { slug: 'barnaul', nameRu: 'Барнаул' },
  { slug: 'ulyanovsk', nameRu: 'Ульяновск' },
  { slug: 'irkutsk', nameRu: 'Иркутск' },
  { slug: 'khabarovsk', nameRu: 'Хабаровск' },
  { slug: 'yaroslavl', nameRu: 'Ярославль' },
  { slug: 'vladivostok', nameRu: 'Владивосток' },
  { slug: 'makhachkala', nameRu: 'Махачкала' },
  { slug: 'tomsk', nameRu: 'Томск' },
  { slug: 'orenburg', nameRu: 'Оренбург' },
  { slug: 'kemerovo', nameRu: 'Кемерово' },
  { slug: 'novokuznetsk', nameRu: 'Новокузнецк' },
  { slug: 'ryazan', nameRu: 'Рязань' },
  { slug: 'astrakhan', nameRu: 'Астрахань' },
  { slug: 'naberezhnye-chelny', nameRu: 'Набережные Челны' },
  { slug: 'penza', nameRu: 'Пенза' },
  { slug: 'lipetsk', nameRu: 'Липецк' },
  { slug: 'kirov', nameRu: 'Киров' },
  { slug: 'cheboksary', nameRu: 'Чебоксары' },
  { slug: 'tula', nameRu: 'Тула' },
  { slug: 'kaliningrad', nameRu: 'Калининград' },
  { slug: 'kursk', nameRu: 'Курск' },
  { slug: 'stavropol', nameRu: 'Ставрополь' },
  { slug: 'ulan-ude', nameRu: 'Улан-Удэ' },
  { slug: 'tver', nameRu: 'Тверь' },
  { slug: 'magnitogorsk', nameRu: 'Магнитогорск' },
  { slug: 'sochi', nameRu: 'Сочи' },
  { slug: 'ivanovo', nameRu: 'Иваново' },
  { slug: 'bryansk', nameRu: 'Брянск' },
  { slug: 'belgorod', nameRu: 'Белгород' },
  { slug: 'surgut', nameRu: 'Сургут' },
  { slug: 'vladimir', nameRu: 'Владимир' },
  { slug: 'chita', nameRu: 'Чита' },
  { slug: 'arkhangelsk', nameRu: 'Архангельск' },
  { slug: 'kaluga', nameRu: 'Калуга' },
  { slug: 'smolensk', nameRu: 'Смоленск' },
  { slug: 'volzhsky', nameRu: 'Волжский' },
  { slug: 'murmansk', nameRu: 'Мурманск' },
  { slug: 'vologda', nameRu: 'Вологда' },
  { slug: 'yakutsk', nameRu: 'Якутск' },
  { slug: 'podolsk', nameRu: 'Подольск' },
];

const cityBySlug = new Map(RU_CITIES.map((c) => [c.slug, c]));

/** Имя города для отображения (локаль ru). nameKey в БД: geo.city.<slug>. */
export function cityNameRu(slug: string): string {
  return cityBySlug.get(slug)?.nameRu ?? slug;
}
