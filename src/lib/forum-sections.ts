/**
 * Разделы форума.
 *
 * Живут в коде, а не в базе: их полдюжины, меняются они раз в год, а таблица
 * потребовала бы сида, админки и миграции на каждое переименование. Тот же
 * приём, что у городов и жанров.
 *
 * Набор разделов — это заявление о том, чем сообщество занимается. Здесь нет
 * «Курилки» и «Оффтопа» намеренно: раздел без темы собирает разговор без
 * темы, а модераторов, чтобы его вести, у нас нет.
 */
export type ForumSection = {
  slug: string;
  /** Порядок в списке — от ремесла к площадке. */
  order: number;
};

export const FORUM_SECTIONS: ForumSection[] = [
  { slug: 'craft', order: 1 }, // съёмка событий: свет, репортажное мышление, сложные условия
  { slug: 'gear', order: 2 }, // техника и всё, что с ней
  { slug: 'clients', order: 3 }, // работа с заказчиком: договорённости, ожидания, сложные ситуации
  { slug: 'business', order: 4 }, // деньги, налоги, право
  { slug: 'platform', order: 5 }, // площадка: вопросы, предложения, что не работает
];

export function isForumSection(slug: string): boolean {
  return FORUM_SECTIONS.some((s) => s.slug === slug);
}

export function forumSectionSlugs(): string[] {
  return FORUM_SECTIONS.map((s) => s.slug);
}
