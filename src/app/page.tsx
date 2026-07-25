import Link from "next/link";
import { ru } from "@/i18n/ru";
import { freshPhotos } from "@/lib/feeds";
import { webVariantUrl } from "@/lib/photos";
import { db } from "@/lib/db";
import { LandingHero } from "@/components/LandingHero";

// force-dynamic: лендинг тянет свежие работы из БД (урок: static-страница с
// запросом падает на пререндере в Docker-билде без DATABASE_URL).
export const dynamic = "force-dynamic";

// Лендинг (закрытая бета). MyWed-направление: светлый поиск-первый герой → фото.
export default async function Home() {
  const [recent, photographers, photos] = await Promise.all([
    freshPhotos(12),
    db.photographerProfile.count({ where: { status: "APPROVED" } }),
    db.photo.count({ where: { status: "APPROVED" } }),
  ]);
  return (
    <main className="flex-1">
      <LandingHero photographers={photographers} photos={photos} />

      {recent.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 py-14">
          <h2 className="t-caption muted">{ru.landing.recentWork}</h2>
          <div className="mt-3 columns-2 gap-2 sm:columns-3 md:columns-4">
            {recent.map((p) => (
              <Link key={p.photoId} href={`/ru/photographer/${p.username}`} className="group mb-2 block break-inside-avoid">
                <div className="overflow-hidden rounded-media bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={webVariantUrl(p.storageKey)} alt="" loading="lazy" width={p.width} height={p.height}
                    className="w-full transition duration-300 group-hover:scale-[1.02]" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto grid w-full max-w-4xl gap-x-12 gap-y-8 px-4 pb-16 sm:grid-cols-2">
        <div className="border-t border-line-2 pt-5">
          <h2 className="t-h3">{ru.landing.forPhotographers}</h2>
          <p className="t-body mt-2.5 max-w-prose muted">{ru.landing.forPhotographersText}</p>
        </div>
        <div className="border-t border-line-2 pt-5">
          <h2 className="t-h3">{ru.landing.forClients}</h2>
          <p className="t-body mt-2.5 max-w-prose muted">{ru.landing.forClientsText}</p>
        </div>
      </section>

      {/* Как это работает — три шага (нумерация = реальная последовательность) */}
      <section className="mx-auto w-full max-w-4xl px-4 pb-16">
        <h2 className="t-h2">{ru.landing.howTitle}</h2>
        <ol className="mt-6 grid gap-8 sm:grid-cols-3">
          {[
            { t: ru.landing.step1Title, d: ru.landing.step1Text },
            { t: ru.landing.step2Title, d: ru.landing.step2Text },
            { t: ru.landing.step3Title, d: ru.landing.step3Text },
          ].map((s, i) => (
            <li key={s.t} className="border-t border-line-2 pt-4">
              <span className="t-caption text-recognition tabular-nums">0{i + 1}</span>
              <h3 className="t-h3 mt-1.5">{s.t}</h3>
              <p className="t-body mt-2 muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Отстройка от бирж/соцсетей */}
      <section className="mx-auto w-full max-w-4xl px-4 pb-24">
        <div className="border-t border-line-2 pt-5">
          <h2 className="t-h2">{ru.landing.whyTitle}</h2>
          <p className="t-body-lg mt-3 max-w-prose muted">{ru.landing.whyText}</p>
        </div>
      </section>
    </main>
  );
}
