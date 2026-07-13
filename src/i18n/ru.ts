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
} as const;

export type Dictionary = typeof ru;
