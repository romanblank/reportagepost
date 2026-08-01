import { describeApiError } from '@/lib/form-errors';

/**
 * Единый клиентский слой обращений к нашему API (аудит 2026-08-01, P2).
 *
 * Раньше каждый компонент писал `await fetch(...).catch(() => null)` и сам
 * изобретал реакцию: toast, локальный setError, boolean-флаг без текста,
 * исчезновение элемента — или полное молчание. Шесть разных поведений на один
 * и тот же обрыв сети, причём часть из них по определению беззвучна: человек
 * нажимает кнопку, ничего не происходит, и он не знает почему.
 *
 * Хуже разнобоя было отсутствие точки перехвата: политику ошибок нельзя было ни
 * задать, ни проверить тестом. Отсюда же росли соседние находки — тоглы без
 * защиты от повторного нажатия и молчаливые провалы в трёх местах.
 *
 * Что даёт слой:
 *  - таймаут (по умолчанию 20 с) — иначе висящий запрос молчит бесконечно;
 *  - разбор ошибки в человеческий текст одним способом (describeApiError);
 *  - один повтор для идемпотентных GET — обычная мобильная сеть роняет
 *    одиночные запросы, и это лечится ретраем, а не сообщением пользователю;
 *  - `ok`-дискриминация вместо исключений: вызывающий код не может забыть
 *    обработать ошибку, потому что до данных иначе не добраться.
 */

/** Таймаут по умолчанию: дольше живой человек ждать не станет. */
const DEFAULT_TIMEOUT_MS = 20_000;

/** Загрузка файлов идёт долго — здесь потолок другой. */
export const UPLOAD_TIMEOUT_MS = 180_000;

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Тело: объект уедет JSON-ом, File/FormData/ReadableStream — как есть. */
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Карты для человеческого текста ошибки (см. describeApiError). */
  fieldLabels?: Record<string, string>;
  codeLabels?: Record<string, string>;
  fallback?: string;
  /** Явный сигнал отмены — комбинируется с таймаутом. */
  signal?: AbortSignal;
}

function isRawBody(body: unknown): body is BodyInit {
  return (
    typeof body === 'string' ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams
  );
}

async function once<T>(path: string, opts: ApiOptions): Promise<ApiResult<T>> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = AbortSignal.timeout(timeoutMs);
  // Отмена вызывающего и таймаут действуют вместе: сработавший первым победит
  const signal = opts.signal ? AbortSignal.any([opts.signal, timer]) : timer;

  const headers: Record<string, string> = { ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (isRawBody(opts.body)) {
      body = opts.body;
    } else {
      body = JSON.stringify(opts.body);
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    }
  }

  let res: Response;
  try {
    res = await fetch(path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, signal });
  } catch {
    // Сеть недоступна или запрос отменён по таймауту — сообщение то же самое,
    // различать их пользователю незачем. status 0 = ответа не было вовсе.
    return { ok: false, error: await describeApiError(null), status: 0 };
  }

  if (!res.ok) {
    const error = await describeApiError(res.clone(), {
      fieldLabels: opts.fieldLabels,
      codeLabels: opts.codeLabels,
      fallback: opts.fallback,
    });
    return { ok: false, error, status: res.status };
  }

  // 204 и пустое тело — законный успех без данных
  const text = await res.text();
  if (!text) return { ok: true, data: undefined as T };
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: true, data: text as unknown as T };
  }
}

/**
 * Запрос к нашему API. Ошибки не бросаются — возвращаются в результате, чтобы
 * их нельзя было незаметно пропустить.
 */
export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<ApiResult<T>> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const result = await once<T>(path, opts);

  // Один повтор — только для GET и только когда ответа не было вовсе.
  // Повторять POST нельзя: он может быть неидемпотентным (лайк, заявка).
  if (!result.ok && result.status === 0 && method === 'GET') {
    return once<T>(path, opts);
  }
  return result;
}

/** Короткая форма для запросов, где важен лишь факт успеха. */
export async function apiOk(path: string, opts: ApiOptions = {}): Promise<boolean> {
  return (await apiFetch(path, opts)).ok;
}
