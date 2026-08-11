'use client';

import { ru } from '@/i18n/ru';

import { useState } from 'react';
import { LightboxModal, type LightboxImage } from '@/components/Lightbox';

// Галерея серии: вертикальная лента кадров + лайтбокс. Client-компонент,
// принимает только сериализуемые данные (RSC-совместимо; render-prop убран).
export function StoryGallery({ images }: { images: LightboxImage[] }) {
  const [index, setIndex] = useState<number | null>(null);
  return (
    <>
      <div className="mt-6 flex flex-col gap-3">
        {images.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={img.src}
            src={img.src}
            alt=""
            loading="lazy"
            width={img.width}
            height={img.height}
            role="button"
            tabIndex={0}
            // Порядковый номер в имени: сорок одинаковых «Открыть кадр» в
            // списке не помогают выбрать, куда идти
            aria-label={ru.story.openPhotoAt(i + 1, images.length)}
            onClick={() => setIndex(i)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIndex(i); } }}
            className="w-full cursor-zoom-in rounded-media focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
        ))}
      </div>
      <LightboxModal images={images} index={index} setIndex={setIndex} />
    </>
  );
}
