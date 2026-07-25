import Link from 'next/link';
import { webVariantUrl } from '@/lib/photos';
import type { FeedPhoto } from '@/lib/feeds';

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
            <img src={webVariantUrl(p.storageKey)} alt="" loading="lazy" width={p.width} height={p.height}
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

/** Горизонтальная кураторская лента крупных кадров (выбор редакции, лучшее). */
export function FeedRow({ photos }: { photos: FeedPhoto[] }) {
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {photos.map((p) => (
        <Link key={p.photoId} href={`/ru/photographer/${p.username}`}
          className="group relative w-[68%] shrink-0 snap-start overflow-hidden rounded-media sm:w-[38%] lg:w-[29%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={webVariantUrl(p.storageKey)} alt="" loading="lazy" width={p.width} height={p.height}
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
