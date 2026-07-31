import Link from 'next/link';
import { webVariantUrl, thumbVariantUrl } from '@/lib/photos';
import type { FeedPhoto } from '@/lib/feeds';
import type { StoryCard } from '@/lib/discovery';

// Переиспользуемые проекции ленты (сериализуемые данные — RSC-совместимо).

/** Masonry-сетка (главная «свежее», ленты). */
export function FeedMasonry({ photos }: { photos: FeedPhoto[] }) {
  return (
    <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
      {photos.map((p) => (
        <Link key={p.photoId} href={`/ru/photographer/${p.username}`}
          className="group mb-3 block break-inside-avoid">
          <div className="relative overflow-hidden rounded-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbVariantUrl(p.storageKey)}
              srcSet={`${thumbVariantUrl(p.storageKey)} 640w, ${webVariantUrl(p.storageKey)} 2048w`}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 400px"
              alt={`${p.firstName} ${p.lastName}`} loading="lazy" width={p.width} height={p.height}
              className="w-full bg-cover bg-center transition duration-500 ease-out group-hover:scale-[1.03]"
              style={p.blurData ? { backgroundImage: `url(${p.blurData})` } : undefined} />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end bg-gradient-to-t from-black/55 to-transparent px-3 pb-2.5 pt-8 text-xs font-medium text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              {p.firstName} {p.lastName}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Карточки репортажей (серии) — обложка + заголовок + автор. */
export function StoryCards({ stories }: { stories: StoryCard[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stories.map((s) => (
        <li key={s.id}>
          <Link href={`/ru/story/${s.id}`} className="group block">
            <div className="relative overflow-hidden rounded-media bg-surface-2">
              {s.coverKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbVariantUrl(s.coverKey)} alt={s.title} loading="lazy"
                  className="aspect-video w-full bg-cover bg-center object-cover transition duration-500 group-hover:scale-[1.03]"
                  style={s.blurData ? { backgroundImage: `url(${s.blurData})` } : undefined} />
              ) : (
                // Плейсхолдер вместо пустого блока: серия без обложки (все фото сняты)
                <div className="grid aspect-video w-full place-items-center text-muted-2">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <rect x="3" y="4" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-5 4 4 3-3 4 4" />
                  </svg>
                </div>
              )}
            </div>
            <h3 className="mt-2 font-medium leading-tight">{s.title}</h3>
            <p className="t-caption muted">{s.authorName}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Горизонтальная кураторская лента крупных кадров (выбор редакции, лучшее). */
export function FeedRow({ photos }: { photos: FeedPhoto[] }) {
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {photos.map((p) => (
        <Link key={p.photoId} href={`/ru/photographer/${p.username}`}
          className="group relative w-[68%] shrink-0 snap-start overflow-hidden rounded-media sm:w-[38%] lg:w-[29%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbVariantUrl(p.storageKey)} alt={`${p.firstName} ${p.lastName}`} loading="lazy" width={p.width} height={p.height}
            className="aspect-[4/5] w-full bg-cover bg-center object-cover transition duration-500 group-hover:scale-[1.03]"
            style={p.blurData ? { backgroundImage: `url(${p.blurData})` } : undefined} />
          <span className="absolute inset-x-0 bottom-0 flex items-center bg-gradient-to-t from-black/60 to-transparent px-3 pb-3 pt-10 text-sm font-medium text-white">
            {p.firstName} {p.lastName}
          </span>
        </Link>
      ))}
    </div>
  );
}
