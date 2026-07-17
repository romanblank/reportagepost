import { z } from 'zod';
import { YANDEX_REDIRECT_URI, YANDEX_OAUTH_SCOPES } from '@/lib/constants';

// Яндекс OAuth (server-side, code-flow). ClientID/секрет — из env (Lockbox).
// Секрет НИКОГДА не уходит в клиент: обмен кода на токен только на сервере.
// Провайдер за абстракцией: без ключей yandexOAuthConfigured()=false.

const AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const TOKEN_URL = 'https://oauth.yandex.ru/token';
const INFO_URL = 'https://login.yandex.ru/info?format=json';

function clientId(): string | undefined {
  return process.env.YANDEX_CLIENT_ID?.trim() || undefined;
}
function clientSecret(): string | undefined {
  return process.env.YANDEX_OAUTH_SECRET?.trim() || undefined;
}

// Для старт-редиректа достаточно ClientID; полный флоу (обмен кода) требует и секрет.
export function yandexStartConfigured(): boolean {
  return Boolean(clientId());
}
export function yandexOAuthConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

export function buildAuthUrl(state: string): string {
  const id = clientId();
  if (!id) throw new Error('YANDEX_CLIENT_ID не задан');
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: id,
    redirect_uri: YANDEX_REDIRECT_URI,
    scope: YANDEX_OAUTH_SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${p.toString()}`;
}

const TokenSchema = z.object({ access_token: z.string().min(1) });

export async function exchangeCode(code: string): Promise<string> {
  const id = clientId();
  const secret = clientSecret();
  if (!id || !secret) throw new Error('Яндекс OAuth не сконфигурирован (нет ClientID/секрета)');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: id,
      client_secret: secret,
    }),
  });
  if (!res.ok) throw new Error(`yandex token exchange failed: ${res.status}`);
  const data = TokenSchema.parse(await res.json());
  return data.access_token;
}

export interface YandexProfile {
  yandexId: string;
  email: string | null;
  firstName: string;
  lastName: string;
}

// Ответ /info валидируем схемой (данным извне не верим).
const InfoSchema = z.object({
  id: z.string().min(1),
  default_email: z.string().email().optional(),
  emails: z.array(z.string()).optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  display_name: z.string().optional(),
  real_name: z.string().optional(),
  login: z.string().optional(),
});

export async function fetchYandexUser(accessToken: string): Promise<YandexProfile> {
  const res = await fetch(INFO_URL, { headers: { Authorization: `OAuth ${accessToken}` } });
  if (!res.ok) throw new Error(`yandex info failed: ${res.status}`);
  const info = InfoSchema.parse(await res.json());
  const email = info.default_email || info.emails?.[0] || null;
  // Имя: first/last, иначе разбор real_name/display_name, иначе логин как фолбэк.
  let firstName = info.first_name?.trim() || '';
  let lastName = info.last_name?.trim() || '';
  if (!firstName) {
    const parts = (info.real_name || info.display_name || info.login || 'Пользователь').trim().split(/\s+/);
    firstName = parts[0] || 'Пользователь';
    lastName = lastName || parts.slice(1).join(' ') || '—';
  }
  if (!lastName) lastName = '—';
  return { yandexId: info.id, email, firstName, lastName };
}
