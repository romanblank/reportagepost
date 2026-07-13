import type { MetadataRoute } from 'next';
import { APP_DOMAIN, PUBLIC_LAUNCH } from '@/lib/constants';

// ИНВАРИАНТ: до публичного запуска (S4) — полный запрет индексации.
export default function robots(): MetadataRoute.Robots {
  if (!PUBLIC_LAUNCH) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `https://${APP_DOMAIN}/sitemap.xml`,
  };
}
