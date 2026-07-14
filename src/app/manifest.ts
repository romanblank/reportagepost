import type { MetadataRoute } from 'next';
import { ru } from '@/i18n/ru';

// PWA-манифест: установка «на главный экран», standalone-режим (без браузерного
// хрома) — база под app-ощущение и будущий Telegram Mini App (S2 GLOBAL-PLAN).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: ru.nav.brand,
    short_name: ru.nav.brand,
    description: ru.meta.description,
    start_url: '/ru/photo',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'ru',
    dir: 'ltr',
    background_color: '#0c0c0e',
    theme_color: '#0c0c0e',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
