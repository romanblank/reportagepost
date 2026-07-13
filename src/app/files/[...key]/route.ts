import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';

// Dev-раздатчик файлов локального хранилища. На проде — CDN перед Object Storage.
export async function GET(
  _req: Request,
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
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
