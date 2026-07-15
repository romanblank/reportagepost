'use client';

import { useState } from 'react';
import { LightboxModal } from '@/components/Lightbox';
import { LikeButton } from '@/components/EngagementButtons';

export interface PortfolioItem {
  id: string;
  src: string;
  width: number;
  height: number;
  blurhash: string | null;
  editorsChoice: boolean;
  liked: boolean;
  likeCount: number;
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
          <figure key={photo.id} className="group relative mb-1 break-inside-avoid sm:mb-2">
            {photo.editorsChoice && (
              <span className="absolute left-2 top-2 z-10 rounded-full bg-recognition px-2 py-0.5 text-xs font-medium text-recognition-ink">
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
              onClick={() => setIndex(i)}
              style={photo.blurhash ? { backgroundImage: `url(${photo.blurhash})` } : undefined}
              className="w-full cursor-zoom-in bg-cover bg-center transition group-hover:brightness-95 sm:rounded-lg"
            />
            <figcaption className="mt-1 px-2 sm:px-0">
              <LikeButton
                photoId={photo.id}
                initialLiked={photo.liked}
                initialCount={photo.likeCount}
                authed={authed}
              />
            </figcaption>
          </figure>
        ))}
      </div>
      <LightboxModal images={items} index={index} setIndex={setIndex} />
    </>
  );
}
