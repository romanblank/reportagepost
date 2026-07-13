// Словарь RU. Конвенция (CLAUDE.md): все строки UI — только отсюда.
// Глобальный задел: en.ts ляжет рядом с теми же ключами.
export const ru = {
  meta: {
    title: 'Reportage Post — сообщество репортажных фотографов',
    description:
      'Каталог и сообщество репортажных фотографов: портфолио, рейтинги, заявки на съёмку событий.',
  },
  landing: {
    closedTitle: 'Reportage Post',
    closedText: 'Платформа готовится к запуску. Доступ — по приглашениям.',
  },
  catalog: {
    title: (city: string) => `Репортажные фотографы — ${city}`,
    metaDescription: (city: string, count: number) =>
      `Каталог репортажных фотографов: ${city}. ${count} проверенных фотографов: портфолио, цены, прямой контакт.`,
    empty: 'В этом городе пока нет фотографов. Скоро появятся.',
    allCategories: 'Все категории',
    perHourFrom: (price: string) => `от ${price}/час`,
    packageLabel: (hours: number, price: string) => `${hours} ч — ${price}`,
    photographersCount: (n: number) => {
      const mod10 = n % 10;
      const mod100 = n % 100;
      if (mod10 === 1 && mod100 !== 11) return `${n} фотограф`;
      if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${n} фотографа`;
      return `${n} фотографов`;
    },
  },
  profile: {
    notFound: 'Фотограф не найден',
    pricesTitle: 'Стоимость',
    portfolioTitle: 'Портфолио',
    contactsTitle: 'Контакты',
    cityLabel: 'Город',
  },
} as const;

export type Dictionary = typeof ru;
