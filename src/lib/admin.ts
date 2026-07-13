import { getSession, type SessionPayload } from '@/lib/auth';

/** Гейт админ-роутов: сессия с ролью ADMIN или null. */
export async function requireAdmin(): Promise<SessionPayload | null> {
  const session = await getSession();
  return session?.role === 'ADMIN' ? session : null;
}
