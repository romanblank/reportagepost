import type { NextConfig } from "next";

// ИНВАРИАНТ (GLOBAL-PLAN S4): X-Robots-Tag noindex на всех ответах до публичного
// запуска — дублирует robots.ts на случай, если краулер игнорирует robots.txt.
// Снимается только пунктом S4 (через PUBLIC_LAUNCH в src/lib/constants.ts).
const PUBLIC_LAUNCH = false;

const nextConfig: NextConfig = {
  output: "standalone", // компактный Docker-образ
  async redirects() {
    // Голый локаль-корень /ru не имеет своей страницы (главная на /) → раньше 404.
    // Ведём на главную, чтобы естественный URL не падал. Точный source — sub-роуты
    // /ru/* (каталог, лента, профили…) НЕ затрагиваются.
    return [{ source: "/ru", destination: "/", permanent: false }];
  },
  async headers() {
    // Security-заголовки (аудит сениоров 2026-07-31, P1): на периметре не было
    // НИ ОДНОГО — ни CSP, ни HSTS, ни защиты от кликджекинга; от CSRF спасал
    // только дефолтный SameSite=Lax у сессионной куки.
    //
    // CSP осознанно допускает 'unsafe-inline' для скриптов: Next.js встраивает
    // RSC-payload инлайном, а строгий nonce-CSP требует middleware на каждый
    // ответ (к S4). Даже в таком виде заголовок закрывает главное: чужие origin
    // для скриптов/форм/фреймов, кликджекинг и подмену base.
    // frame-src — только whitelist провайдеров шоурилов (src/lib/showreel.ts),
    // img-src допускает data: ради LQIP-плейсхолдеров (Photo.blurhash).
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src https://www.youtube.com https://player.vimeo.com https://rutube.ru https://vk.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');

    const security = [
      { key: "Content-Security-Policy", value: csp },
      // HSTS: домен уже только на https (nginx + Let's Encrypt), редирект с 80 есть
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];

    return [
      {
        source: "/:path*",
        headers: PUBLIC_LAUNCH
          ? security
          : [...security, { key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
