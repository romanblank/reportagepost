import type { Metadata, Viewport } from "next";
import { Inter, Cormorant, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ru } from "@/i18n/ru";
import { DEFAULT_LOCALE, PUBLIC_LAUNCH } from "@/lib/constants";
import { SiteHeader } from "@/components/SiteHeader";
import { getSession } from "@/lib/auth";
import { cabinetHrefFor } from "@/lib/nav";
import { MobileTabBar } from "@/components/MobileTabBar";
import { LiveUpdates } from "@/components/LiveUpdates";
import { SiteFooter } from "@/components/SiteFooter";
import { CookieConsent } from "@/components/CookieConsent";

// Editorial Gallery: Inter (текст/UI, лучшая кириллица среди гротесков) +
// Cormorant (журнальная антиква для дисплей-заголовков). Обе с кириллицей.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const cormorant = Cormorant({
  variable: "--font-cormorant",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600"],
  display: "swap",
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
    { media: '(prefers-color-scheme: light)', color: '#fbfbfc' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
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
      className={`${inter.variable} ${cormorant.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* pb-16 на мобиле — под нижнюю таб-навигацию */}
      <body className="min-h-full flex flex-col pb-16 sm:pb-0">
        <SiteHeader />
        {children}
        <SiteFooter />
        {session && <LiveUpdates />}
        <CookieConsent />
        <MobileTabBar authed={Boolean(session)} cabinetHref={cabinetHref} />
      </body>
    </html>
  );
}
