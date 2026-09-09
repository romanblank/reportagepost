'use client';

import { useState } from 'react';
import { ru } from '@/i18n/ru';
import { LightboxModal } from '@/components/Lightbox';
import { LikeButton, SavePhotoButton } from '@/components/EngagementButtons';

export interface PortfolioItem {
  id: string;
  src: string;
  width: number;
  height: number;
  blurhash: string | null;
  editorsChoice: boolean;
  liked: boolean;
  likeCount: number;
  saved: boolean;
}

// Сетка портфолио + лайтбокс. Client-компонент: получает только сериализуемые
// данные (не функции) — RSC-совместимо. Заменил render-prop LightboxGallery,
// который падал 500 при передаче функции из серверной страницы.
export function PortfolioGallery({
  items,
  authed,
  editorsChoiceLabel,
}: {
  items: PortfolioItem[];
  authed: boolean;
  editorsChoiceLabel: string;
}) {
  const [index, setIndex] = useState<number | null>(null);

  return (
    <>
      <div className="mt-3 -mx-4 columns-2 gap-1 px-0 sm:mx-0 sm:gap-2 sm:px-0 md:columns-3">
        {items.map((photo, i) => (
          <figure key={photo.id} className="group relative mb-1 overflow-hidden break-inside-avoid rounded-media sm:mb-2">
            {photo.editorsChoice && (
              <span className="t-caption absolute left-2 top-2 z-10 inline-flex items-center rounded-sm bg-recognition px-2 py-0.5 text-recognition-ink">
                {editorsChoiceLabel}
              </span>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.src}
              alt=""
              loading="lazy"
              width={photo.width}
              height={photo.height}
              role="button"
              tabIndex={0}
              aria-label={ru.profile.openPhoto}
              onClick={() => setIndex(i)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIndex(i); } }}
              style={photo.blurhash ? { backgroundImage: `url(${photo.blurhash})` } : undefined}
              className="w-full cursor-zoom-in bg-cover bg-center transition duration-500 ease-out group-hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            />
            {/* лайк — тонкой накладкой на фото. На устройствах с ховером
                проступает на ховере; на touch ховера НЕТ — кнопки видимы всегда,
                иначе закладку и лайк с телефона не найти (аудит 2026-09-09) */}
            <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-end bg-gradient-to-t from-black/45 to-transparent px-2 pb-2 pt-8 transition-opacity duration-300 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
              <span className="pointer-events-auto flex items-center gap-3">
                <SavePhotoButton photoId={photo.id} initialSaved={photo.saved} authed={authed} />
                <LikeButton photoId={photo.id} initialLiked={photo.liked} initialCount={photo.likeCount} authed={authed} onDark />
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      {/* photoId включает панель лайка/закладки в самом просмотре — на
          телефоне это единственное место, где кнопки под пальцем */}
      <LightboxModal
        images={items.map((p) => ({ ...p, photoId: p.id }))}
        index={index}
        setIndex={setIndex}
        authed={authed}
      />
    </>
  );
}
