import Link from "next/link";
import { ru } from "@/i18n/ru";

// Лендинг (закрытая бета: доступ по приглашениям). Editorial-подача.
export default function Home() {
  return (
    <main className="flex-1">
      <section className="mx-auto w-full max-w-4xl px-4 py-20 sm:py-28 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-accent">
          {ru.landing.kicker}
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold leading-[1.1] sm:text-6xl">
          {ru.landing.heroTitle}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed muted">
          {ru.landing.heroLead}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/ru/register" className="btn btn-accent px-6 py-3 text-base">
            {ru.landing.registerCta}
          </Link>
          <Link href="/ru/login" className="btn btn-outline px-6 py-3 text-base">
            {ru.landing.loginCta}
          </Link>
        </div>
        <p className="mt-6 text-sm muted">{ru.landing.closedNote}</p>
      </section>

      <section className="mx-auto grid w-full max-w-4xl gap-4 px-4 pb-24 sm:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-lg font-semibold">{ru.landing.forPhotographers}</h2>
          <p className="mt-2 text-sm leading-relaxed muted">{ru.landing.forPhotographersText}</p>
        </div>
        <div className="card p-6">
          <h2 className="text-lg font-semibold">{ru.landing.forClients}</h2>
          <p className="mt-2 text-sm leading-relaxed muted">{ru.landing.forClientsText}</p>
        </div>
      </section>
    </main>
  );
}
