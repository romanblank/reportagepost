import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import { contentTypeForKey } from '@/lib/videos';

// Dev-раздатчик файлов локального хранилища. На проде — CDN перед Object Storage.
// Поддержка Range (206) — обязательна для перемотки <video>.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const joined = key.join('/');
  let data: Buffer | null;
  try {
    data = await storage.get(joined);
  } catch {
    return NextResponse.json({ error: 'bad_key' }, { status: 400 });
  }
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const contentType = contentTypeForKey(joined) ?? 'image/jpeg';
  const total = data.byteLength;
  const cache = 'public, max-age=31536000, immutable';

  // Range-запрос (перемотка видео): отдаём 206 с нужным срезом.
  const range = req.headers.get('range');
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m) {
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : total - 1;
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end) || end >= total) end = total - 1;
    if (start > end || start >= total) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' },
      });
    }
    const chunk = data.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunk.byteLength),
        'Cache-Control': cache,
      },
    });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(total),
      'Cache-Control': cache,
    },
  });
}
