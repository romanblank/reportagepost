import Link from "next/link";
import { ru } from "@/i18n/ru";
import { freshPhotos } from "@/lib/feeds";
import { webVariantUrl } from "@/lib/photos";
import { HeroWallpaper } from "@/components/HeroWallpaper";

// force-dynamic: лендинг тянет свежие работы из БД (урок: static-страница с
// запросом падает на пререндере в Docker-билде без DATABASE_URL).
export const dynamic = "force-dynamic";

// Лендинг (закрытая бета: доступ по приглашениям). Editorial-подача + живая лента.
export default async function Home() {
  const recent = await freshPhotos(12);
  return (
    <main className="flex-1">
      <HeroWallpaper />

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

      <section className="mx-auto grid w-full max-w-4xl gap-x-12 gap-y-8 px-4 pb-24 sm:grid-cols-2">
        <div className="border-t border-line-2 pt-5">
          <h2 className="t-h3">{ru.landing.forPhotographers}</h2>
          <p className="t-body mt-2.5 max-w-prose muted">{ru.landing.forPhotographersText}</p>
        </div>
        <div className="border-t border-line-2 pt-5">
          <h2 className="t-h3">{ru.landing.forClients}</h2>
          <p className="t-body mt-2.5 max-w-prose muted">{ru.landing.forClientsText}</p>
        </div>
      </section>
    </main>
  );
}
