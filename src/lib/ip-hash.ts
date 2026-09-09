import { createHmac } from 'node:crypto';

/**
 * Хеш IP-адреса для хранения в БД (кластеры, дедуп, след согласия).
 *
 * Именно HMAC с секретом, а не голый sha256: пространство IPv4 — 4 млрд
 * значений, и несолёная таблица хешей перебирается за минуты — утёкший дамп
 * деанонимизировал бы адреса, которые мы храним хешем ИМЕННО как ПДн-защиту
 * (аудит 2026-09-09 закрыл это для подтверждений съёмок, 2026-09-10 — для
 * cookie-согласий и раскрытий номера).
 *
 * `purpose` разводит области: одинаковый IP в разных механиках даёт разные
 * хеши — таблицы нельзя сджойнить между собой по адресу.
 * Без AUTH_SECRET (тесты без env) возвращает null — след без адреса честнее
 * ложно-солёного хеша.
 */
export function hashIp(purpose: string, ip: string | null | undefined): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!ip || !secret) return null;
  return createHmac('sha256', secret).update(`${purpose}:${ip}`).digest('hex');
}
