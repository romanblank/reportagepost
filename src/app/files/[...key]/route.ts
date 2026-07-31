import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { contentTypeForKey } from '@/lib/videos';

// Раздатчик объектов хранилища (бакет приватный, поэтому через свой роут; на
// проде перед ним должен встать CDN/кэш nginx — тогда сюда доходят только промахи).
// Поддержка Range (206) — обязательна для перемотки <video>.
//
// 🔴 АУДИТ 2026-07-31 (P0, независимо найден security и architecture): раньше
// роут делал storage.get() — тянул объект ЦЕЛИКОМ в heap и лишь потом резал
// нужный кусок. Несколько перемоток 200-МБ шоурила = несколько сотен МБ в
// памяти единственного контейнера (лимит 2 ГБ) → OOM → падает весь прод.
// Теперь тело идёт потоком, а диапазон запрашивается у самого S3.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const joined = key.join('/');

  let total: number | null;
  try {
    total = await storage.size(joined);
  } catch {
    return NextResponse.json({ error: 'bad_key' }, { status: 400 });
  }
  if (total === null) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const contentType = contentTypeForKey(joined) ?? 'image/jpeg';
  const cache = 'public, max-age=31536000, immutable';

  // Range-запрос (перемотка видео): отдаём 206 с нужным срезом.
  const range = req.headers.get('range');
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m) {
    let start: number;
    let end: number;
    if (m[1] === '' && m[2] !== '') {
      // Суффикс-диапазон `bytes=-N` — последние N байт.
      start = Math.max(0, total - parseInt(m[2], 10));
      end = total - 1;
    } else {
      start = m[1] ? parseInt(m[1], 10) : 0;
      end = m[2] ? parseInt(m[2], 10) : total - 1;
    }
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end) || end >= total) end = total - 1;
    if (start > end || start >= total) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' },
      });
    }
    const part = await storage.getStream(joined, { start, end });
    if (!part) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return new NextResponse(part.body, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Cache-Control': cache,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const whole = await storage.getStream(joined);
  if (!whole) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return new NextResponse(whole.body, {
    headers: {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(total),
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
