import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { DomainError } from '@/lib/errors';

/**
 * Импорт портфолио по ссылке (S3, онбординг амбассадора и ближнего круга).
 *
 * Главный барьер входа фотографа — не форма, а необходимость заново собирать
 * портфолио: работы уже лежат на его сайте или в соцсети. Здесь мы читаем
 * страницу, показываем найденные кадры и переносим выбранные — автор
 * подтверждает, что это его работы, а дальше они идут обычным путём: дедуп,
 * премодерация, ручная модерация.
 *
 * Всё, что связано с загрузкой чужого URL, — потенциальный SSRF: адрес выбирает
 * пользователь, а запрос делает наш сервер, у которого есть доступ к внутренней
 * сети и метаданным облака. Поэтому проверка адреса не «на всякий случай», а
 * условие существования этой фичи.
 */

/** Сколько кадров показываем к выбору: страница может содержать сотни картинок. */
export const MAX_CANDIDATES = 60;
/** Потолок веса страницы — от «бесконечного» ответа, съедающего память. */
export const MAX_PAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 12_000;
/** Сколько кадров за раз переносим — иначе один запрос занимает контейнер надолго. */
export const MAX_PULL_AT_ONCE = 12;

export class ImportError extends DomainError {
  constructor(code: 'import_bad_url' | 'import_blocked_host' | 'import_unreachable' | 'import_no_images' | 'import_too_large') {
    super(code, code === 'import_too_large' ? 413 : 422);
    this.name = 'ImportError';
  }
}

/**
 * Приватные и служебные диапазоны IPv4/IPv6.
 *
 * `169.254.169.254` (метаданные облака) — самая ценная цель SSRF: оттуда
 * забирают токены сервисного аккаунта. Он попадает под link-local, но упомянут
 * отдельно, чтобы правило нельзя было «упростить» по недосмотру.
 */
function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true;
    // IPv4-mapped (::ffff:10.0.0.1) — тот же приватный адрес в другой записи
    const mapped = v6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, включая 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast и зарезервированное
  return false;
}

/**
 * Проверяет, что адрес ведёт наружу, а не внутрь нашей сети.
 *
 * Резолвим ВСЕ адреса имени: домен может отдавать и публичный, и приватный
 * адрес (классический обход через DNS с несколькими A-записями).
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImportError('import_bad_url');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ImportError('import_bad_url');
  // Нестандартные порты — почти всегда внутренние сервисы
  if (url.port && url.port !== '80' && url.port !== '443') throw new ImportError('import_blocked_host');

  // У IPv6-адреса hostname приходит в скобках (`[::1]`) — без их снятия
  // проверка «это литерал IP» не срабатывает и адрес уходит в резолвер
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.internal')) {
    throw new ImportError('import_blocked_host');
  }

  // Адрес-литерал проверяем напрямую: резолвер на него полагаться не даёт —
  // `[::1]` он вовсе не разрешает, и проверка выдавала бы «недоступно» вместо
  // «запрещено», а на другой машине могла бы и пропустить.
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new ImportError('import_blocked_host');
    return url;
  }

  const addresses = await lookup(hostname, { all: true }).catch(() => null);
  if (!addresses || addresses.length === 0) throw new ImportError('import_unreachable');
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new ImportError('import_blocked_host');

  return url;
}

/** Абсолютный URL картинки или `null`, если ссылка не годится. */
function absolutize(src: string, base: URL): string | null {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;
  try {
    const u = new URL(trimmed, base);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Из srcset берём самый крупный вариант — портфолио заслуживает оригинала. */
function widestFromSrcset(srcset: string, base: URL): string | null {
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(',')) {
    const [rawUrl, size] = part.trim().split(/\s+/);
    if (!rawUrl) continue;
    const abs = absolutize(rawUrl, base);
    if (!abs) continue;
    const w = size?.endsWith('w') ? Number(size.slice(0, -1)) : 0;
    if (!best || w > best.w) best = { url: abs, w: Number.isFinite(w) ? w : 0 };
  }
  return best?.url ?? null;
}

/**
 * Кадры-кандидаты со страницы: og:image, srcset и обычные img.
 *
 * Иконки, логотипы и спрайты отсеиваем по имени файла и формату: в портфолио
 * они не нужны, а автор иначе получил бы сетку из значков соцсетей.
 */
export function extractImageUrls(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const found: string[] = [];
  const push = (u: string | null) => {
    if (u && !found.includes(u)) found.push(u);
  };

  for (const m of html.matchAll(/<meta[^>]+property=["']og:image[^>]*content=["']([^"']+)["']/gi)) {
    push(absolutize(m[1], base));
  }
  for (const m of html.matchAll(/<img[^>]*>/gi)) {
    const tag = m[0];
    const srcset = tag.match(/(?:data-)?srcset=["']([^"']+)["']/i);
    if (srcset) {
      push(widestFromSrcset(srcset[1], base));
      continue;
    }
    // Ленивая загрузка прячет настоящий адрес в data-атрибут, а в src кладёт
    // заглушку — без этого с половины сайтов приезжали бы пустышки
    const src = tag.match(/(?:data-src|data-original|src)=["']([^"']+)["']/i);
    if (src) push(absolutize(src[1], base));
  }

  const junk = /(sprite|icon|logo|avatar|favicon|placeholder|badge|pixel|blank)/i;
  const notPhoto = /\.(svg|gif|ico|webp\?icon)(\?|$)/i;
  return found.filter((u) => !junk.test(u) && !notPhoto.test(u)).slice(0, MAX_CANDIDATES);
}

/** Скачивает страницу с потолком веса и таймаутом. */
export async function fetchPage(url: URL): Promise<string> {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'user-agent': 'ReportagePostImporter/1.0 (+https://reportagepost.com)' },
  }).catch(() => null);
  if (!res || !res.ok) throw new ImportError('import_unreachable');

  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_PAGE_BYTES) throw new ImportError('import_too_large');

  const buf = Buffer.from(await res.arrayBuffer());
  // Заголовку веса верить нельзя — проверяем и фактический размер
  if (buf.byteLength > MAX_PAGE_BYTES) throw new ImportError('import_too_large');
  return buf.toString('utf8');
}

/** Скачивает один кадр. Адрес проверяется отдельно: редирект мог увести внутрь сети. */
export async function fetchImage(rawUrl: string): Promise<Buffer> {
  const url = await assertPublicUrl(rawUrl);
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'user-agent': 'ReportagePostImporter/1.0 (+https://reportagepost.com)' },
  }).catch(() => null);
  if (!res || !res.ok) throw new ImportError('import_unreachable');

  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new ImportError('import_no_images');
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new ImportError('import_too_large');

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) throw new ImportError('import_too_large');
  return buf;
}
