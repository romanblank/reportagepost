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
  auth: {
    registerTitle: 'Регистрация по приглашению',
    firstName: 'Имя',
    lastName: 'Фамилия',
    inviteCode: 'Код приглашения',
    rolePhotographer: 'Я фотограф',
    roleClient: 'Я заказчик',
    submitRegister: 'Зарегистрироваться',
    errorInvite: 'Код приглашения не подошёл',
    errorEmailTaken: 'Этот email уже зарегистрирован',
    loginTitle: 'Вход',
    email: 'Email',
    password: 'Пароль',
    submitLogin: 'Войти',
    errorInvalid: 'Неверный email или пароль',
    errorBanned: 'Аккаунт заблокирован',
    errorGeneric: 'Не получилось войти. Попробуйте ещё раз.',
  },
  inquiry: {
    title: 'Заявка на съёмку',
    lead: 'Опишите событие — фотографы города получат вашу заявку и свяжутся с вами.',
    contactName: 'Ваше имя',
    contactPhone: 'Телефон (+7…)',
    contactEmail: 'Email',
    contactHint: 'Укажите телефон или email — иначе фотографам некуда ответить',
    city: 'Город',
    category: 'Тип события',
    categoryAny: 'Любой',
    eventDate: 'Дата события',
    budget: 'Бюджет, ₽ (необязательно)',
    description: 'Что снимаем? (минимум 20 символов)',
    submit: 'Отправить заявку',
    sent: 'Заявка отправлена. Фотографы города увидят её и свяжутся с вами.',
    sentNotified: (n: number) => `Уведомлено фотографов: ${n}.`,
    errorNoContact: 'Укажите телефон или email',
    errorGeneric: 'Не получилось отправить. Проверьте поля и попробуйте ещё раз.',
  },
} as const;

export type Dictionary = typeof ru;
