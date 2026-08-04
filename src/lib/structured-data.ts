import { BASE_URL } from '@/lib/sitemap';

// JSON-LD микроразметка (SEO-каркас S1). Чистые билдеры — тестируемо.
// ИНВАРИАНТ: aggregateRating НЕ включаем до публичного запуска (S4) — не палим
// рейтинги/метрики закрытой платформы. Добавить в S4 вместе со снятием noindex.

export interface PersonLdInput {
  firstName: string;
  lastName: string;
  username: string;
  cityName: string;
  categories: string[];
  imageUrls: string[]; // абсолютные URL превью (до 5)
  bio?: string | null;
}

export function personLd(p: PersonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: `${p.firstName} ${p.lastName}`.trim(),
    jobTitle: 'Репортажный фотограф',
    knowsAbout: p.categories,
    address: { '@type': 'PostalAddress', addressLocality: p.cityName, addressCountry: 'RU' },
    url: `${BASE_URL}/ru/photographer/${p.username}`,
    ...(p.bio ? { description: p.bio } : {}),
    ...(p.imageUrls.length ? { image: p.imageUrls.slice(0, 5) } : {}),
  };
}

export interface CatalogLdItem {
  username: string;
  name: string;
}

export function catalogItemListLd(listName: string, items: CatalogLdItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE_URL}/ru/photographer/${it.username}`,
      name: it.name,
    })),
  };
}

// Хлебные крошки (BreadcrumbList) для город/город×категория — SEO-навигация.
export function breadcrumbLd(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${BASE_URL}${it.path}`,
    })),
  };
}


/**
 * Обсуждение на форуме.
 *
 * Без этой разметки сотни страниц форума выглядят для робота как случайный
 * текст на сайте фотографов. С ней — как то, чем они и являются: вопрос
 * специалиста и ответы коллег, то есть ровно тот тип страницы, который
 * поисковик показывает по практическому запросу.
 */
export function forumPostingLd(input: {
  title: string;
  url: string;
  createdAt: Date;
  authorName: string;
  body: string;
  replies: { body: string; createdAt: Date; authorName: string }[];
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: input.title,
    url: input.url,
    datePublished: input.createdAt.toISOString(),
    author: { '@type': 'Person', name: input.authorName },
    articleBody: input.body,
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/CommentAction',
      userInteractionCount: input.replies.length,
    },
    comment: input.replies.slice(0, 20).map((r) => ({
      '@type': 'Comment',
      text: r.body.slice(0, 500),
      datePublished: r.createdAt.toISOString(),
      author: { '@type': 'Person', name: r.authorName },
    })),
  };
}

/** Статья журнала. */
export function articleLd(input: {
  title: string;
  lead: string;
  url: string;
  publishedAt: Date;
  authorName: string;
  imageUrl: string | null;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.lead,
    mainEntityOfPage: input.url,
    datePublished: input.publishedAt.toISOString(),
    author: { '@type': 'Person', name: input.authorName },
    ...(input.imageUrl ? { image: input.imageUrl } : {}),
    publisher: { '@type': 'Organization', name: 'Репортаж Пост' },
  };
}


/**
 * Сайт и организация — разметка уровня всего домена.
 *
 * Нужна не ради «галочки SEO»: без неё поисковик не знает, как называется
 * площадка и что у неё есть поиск, и показывает домен голой строкой. С ней
 * появляется имя, логотип и строка поиска прямо в выдаче.
 */
export function websiteLd(baseUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Репортаж Пост',
    url: baseUrl,
    inLanguage: 'ru-RU',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${baseUrl}/ru/photo?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function organizationLd(baseUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Репортаж Пост',
    url: baseUrl,
    logo: `${baseUrl}/icons/icon-192.png`,
  };
}

/**
 * Вопросы и ответы автора.
 *
 * Ровно тот блок, ради которого заказчик и открывает страницу вторым заходом:
 * «сколько стоит», «сколько кадров», «когда отдаёте». Разметка выводит эти
 * ответы прямо в выдачу.
 */
export function faqLd(items: { q: string; a: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  };
}
