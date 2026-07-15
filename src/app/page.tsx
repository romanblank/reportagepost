import Link from "next/link";
import { ru } from "@/i18n/ru";
import { freshPhotos } from "@/lib/feeds";
import { webVariantUrl } from "@/lib/photos";

// force-dynamic: лендинг тянет свежие работы из БД (урок: static-страница с
// запросом падает на пререндере в Docker-билде без DATABASE_URL).
export const dynamic = "force-dynamic";

// Лендинг (закрытая бета: доступ по приглашениям). Editorial-подача + живая лента.
export default async function Home() {
  const recent = await freshPhotos(12);
  return (
    <main className="flex-1">
      <section className="mx-auto w-full max-w-4xl px-4 py-20 sm:py-28 text-center">
        <p className="t-caption text-accent">
          {ru.landing.kicker}
        </p>
        <h1 className="t-display mx-auto mt-4 max-w-3xl">
          {ru.landing.heroTitle}
        </h1>
        <p className="t-body-lg mx-auto mt-6 max-w-2xl muted">
          {ru.landing.heroLead}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/ru/register" className="btn btn-accent btn-lg">
            {ru.landing.registerCta}
          </Link>
          <Link href="/ru/login" className="btn btn-outline btn-lg">
            {ru.landing.loginCta}
          </Link>
        </div>
        <p className="mt-6 text-sm muted">{ru.landing.closedNote}</p>
      </section>

      {recent.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-16">
          <h2 className="t-caption muted">{ru.landing.recentWork}</h2>
          <div className="mt-3 columns-2 gap-2 sm:columns-3 md:columns-4">
            {recent.map((p) => (
              <Link key={p.photoId} href={`/ru/photographer/${p.username}`} className="group mb-2 block break-inside-avoid">
                <div className="overflow-hidden rounded-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={webVariantUrl(p.storageKey)} alt="" loading="lazy" width={p.width} height={p.height}
                    className="w-full transition duration-300 group-hover:scale-[1.02]" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto grid w-full max-w-4xl gap-4 px-4 pb-24 sm:grid-cols-2">
        <div className="card p-6">
          <h2 className="t-h3">{ru.landing.forPhotographers}</h2>
          <p className="mt-2 text-sm leading-relaxed muted">{ru.landing.forPhotographersText}</p>
        </div>
        <div className="card p-6">
          <h2 className="t-h3">{ru.landing.forClients}</h2>
          <p className="mt-2 text-sm leading-relaxed muted">{ru.landing.forClientsText}</p>
        </div>
      </section>
    </main>
  );
}
