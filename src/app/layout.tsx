import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ru } from "@/i18n/ru";
import { DEFAULT_LOCALE, PUBLIC_LAUNCH } from "@/lib/constants";
import { SiteHeader } from "@/components/SiteHeader";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={DEFAULT_LOCALE}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
