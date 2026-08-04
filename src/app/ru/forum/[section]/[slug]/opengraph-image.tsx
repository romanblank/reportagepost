import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { threadBySlug } from '@/lib/forum';
import { isForumSection } from '@/lib/forum-sections';
import { ru } from '@/i18n/ru';

/**
 * Картинка ссылки на тему.
 *
 * Ссылками на форум делятся в мессенджерах, и без превью такая ссылка
 * выглядит как голый адрес — её не открывают. Рисуем заголовок темы на
 * фирменном грунте: узнаётся площадка и сразу видно, о чём разговор.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = ru.nav.brand;

export default async function Image({ params }: { params: Promise<{ section: string; slug: string }> }) {
  const { section, slug } = await params;
  const thread = isForumSection(section) ? await threadBySlug(slug) : null;

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
        <div style={{ display: 'flex', fontSize: 22, letterSpacing: 6, color: '#e08a5e', fontFamily: 'Inter' }}>
          {(ru.forum.sections[section] ?? ru.forum.title).toUpperCase()}
        </div>
        <div style={{ display: 'flex', fontSize: 64, lineHeight: 1.1, fontFamily: 'Cormorant' }}>
          {(thread?.title ?? ru.forum.title).slice(0, 110)}
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#9295a2', fontFamily: 'Inter' }}>
          {ru.forum.ogFooter}
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
