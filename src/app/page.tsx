import Link from "next/link";
import { ru } from "@/i18n/ru";

// Временная закрытая заглушка (до S4 платформа не индексируется и не открыта).
// Заменяется каталогом/лендингом в S1–S2.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        {ru.landing.closedTitle}
      </h1>
      <p className="max-w-md text-balance opacity-70">
        {ru.landing.closedText}
      </p>
      <div className="mt-2 flex gap-3">
        <Link href="/ru/register" className="rounded-lg bg-foreground px-4 py-2 text-background">
          {ru.landing.registerCta}
        </Link>
        <Link href="/ru/login" className="rounded-lg border px-4 py-2">
          {ru.landing.loginCta}
        </Link>
      </div>
    </main>
  );
}
