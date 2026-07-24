import type { MetadataRoute } from 'next';
import { APP_DOMAIN, PUBLIC_LAUNCH } from '@/lib/constants';

// ИНВАРИАНТ: до публичного запуска (S4) — сайт НЕ в поиске.
// ВАЖНО (robots-парадокс): глушим индексацию через noindex (meta в layout +
// nginx X-Robots-Tag), а краулинг РАЗРЕШАЕМ. Если закрыть краулинг Disallow'ом,
// бот не увидит noindex и проиндексирует голый URL по внешним ссылкам. Разрешая
// заход, мы даём боту прочитать noindex и выкинуть страницы из индекса.
// Sitemap не отдаём до S4 (нечего продвигать).
export default function robots(): MetadataRoute.Robots {
  if (!PUBLIC_LAUNCH) {
    return { rules: { userAgent: '*', allow: '/', disallow: '/api/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `https://${APP_DOMAIN}/sitemap.xml`,
  };
}
