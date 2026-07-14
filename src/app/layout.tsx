import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ru } from "@/i18n/ru";
import { DEFAULT_LOCALE, PUBLIC_LAUNCH } from "@/lib/constants";
import { SiteHeader } from "@/components/SiteHeader";
import { getSession } from "@/lib/auth";
import { cabinetHrefFor } from "@/lib/nav";
import { MobileTabBar } from "@/components/MobileTabBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: ru.meta.title,
  description: ru.meta.description,
  // Инвариант закрытости до S4: meta-noindex как третий эшелон (robots.txt +
  // X-Robots-Tag + это). Снимается только с PUBLIC_LAUNCH (аудит P1).
  robots: PUBLIC_LAUNCH ? undefined : { index: false, follow: false },
  // PWA: iOS standalone («на главный экран») + иконки
  appleWebApp: { capable: true, title: ru.nav.brand, statusBarStyle: 'default' },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

// Тема-зависимый цвет тулбара + viewport (Next 16: отдельный экспорт)
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0e' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const cabinetHref = cabinetHrefFor(session?.role);
  return (
    <html
      lang={DEFAULT_LOCALE}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* pb-16 на мобиле — под нижнюю таб-навигацию */}
      <body className="min-h-full flex flex-col pb-16 sm:pb-0">
        <SiteHeader />
        {children}
        <MobileTabBar authed={Boolean(session)} cabinetHref={cabinetHref} />
      </body>
    </html>
  );
}
