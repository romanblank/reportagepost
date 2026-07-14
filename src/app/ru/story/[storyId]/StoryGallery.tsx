'use client';

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
            onClick={() => setIndex(i)}
            className="w-full cursor-zoom-in rounded-lg"
          />
        ))}
      </div>
      <LightboxModal images={images} index={index} setIndex={setIndex} />
    </>
  );
}
