import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { db } from '@/lib/db';
import { cityNameRu } from '@/lib/geo-data';
import { ru } from '@/i18n/ru';

/**
 * Картинка ссылки на страницу автора.
 *
 * Ссылку на себя фотограф отправляет заказчику руками — в мессенджер, в почту,
 * в переписку агентства. Без превью там появляется голый адрес, и первое
 * впечатление о человеке создаёт не его работа, а строка текста.
 *
 * Кадр не берём: он лежит в хранилище, а рисовать превью, зависящее от чужой
 * сети, значит иногда отдавать пустоту. Имя на фирменном грунте отдаётся
 * всегда.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = ru.nav.brand;

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await db.photographerProfile.findUnique({
    where: { username },
    select: {
      status: true,
      city: { select: { slug: true } },
      user: { select: { firstName: true, lastName: true } },
      categories: { select: { category: { select: { slug: true } } }, take: 3 },
    },
  });

  const name = profile?.status === 'APPROVED'
    ? `${profile.user.firstName} ${profile.user.lastName}`
    : ru.nav.brand;
  const city = profile?.city ? cityNameRu(profile.city.slug) : '';

  const [display, body] = await Promise.all([
    readFile(path.join(process.cwd(), 'src/assets/fonts/CormorantGaramond-SemiBold.ttf')),
    readFile(path.join(process.cwd(), 'src/assets/fonts/Inter-Regular.ttf')),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0f1218',
          padding: 64,
          color: '#ece7dd',
        }}
      >
        <div style={{ display: 'flex', fontSize: 22, letterSpacing: 6, color: '#e08a5e' }}>
          {ru.meta.ogKicker.toUpperCase()}
        </div>
        <div style={{ display: 'flex', fontSize: 76, fontFamily: 'Cormorant' }}>{name}</div>
        <div style={{ display: 'flex', fontSize: 24, color: '#9295a2', fontFamily: 'Inter' }}>
          {[city, ru.nav.brand].filter(Boolean).join(' · ')}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Cormorant', data: display, style: 'normal', weight: 600 },
        { name: 'Inter', data: body, style: 'normal', weight: 400 },
      ],
    },
  );
}
