import { llmComplete } from '@/lib/ai-gpt';
import { programmaticVerdict, type ProgrammaticInput, type TextVerdict, type ModerationReasonCode } from '@/lib/text-moderation-rules';

export * from '@/lib/text-moderation-rules';

/** Ответ модели — до guard'а. Ни одно поле не применяется как есть. */
type RawModelVerdict = {
  verdict?: unknown;
  category?: unknown;
  confidence?: unknown;
  quote?: unknown;
};

const MODEL_CATEGORIES: ModerationReasonCode[] = ['insult', 'harassment', 'hidden_ad', 'off_topic', 'unsafe'];

const SYSTEM_PROMPT = `Ты — помощник модерации сообщества фотографов. Тебе дают текст сообщения.
Ответь СТРОГО одним JSON-объектом:
{"verdict":"ok"|"bad","category":"insult"|"harassment"|"hidden_ad"|"off_topic"|"unsafe"|null,"confidence":0..1,"quote":"дословный фрагмент текста или null"}
Правила:
- "insult" — оскорбление человека, в том числе без мата.
- "harassment" — травля, угрозы, преследование.
- "hidden_ad" — реклама стороннего сервиса под видом совета.
- "off_topic" — не о фотографии и не о работе фотографа вовсе.
- "unsafe" — призывы к насилию, дискриминация, опасные советы.
Профессиональный спор, критика работы, резкая, но предметная оценка — это "ok".
Цитата обязана дословно встречаться в тексте.`;

/**
 * Guard над ответом модели.
 *
 * Экспортирован ради тестов и потому, что это и есть место, где принимается
 * решение: модель лишь описывает текст. Порог намеренно высокий, а всё, что
 * ниже, уходит к человеку — ошибочный отказ дороже задержки.
 */
export function guardModelVerdict(raw: unknown, sourceText: string): TextVerdict | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as RawModelVerdict;

  if (v.verdict === 'ok') return { action: 'publish' };
  if (v.verdict !== 'bad') return null; // непонятный ответ = модели не было

  const category = MODEL_CATEGORIES.find((c) => c === v.category);
  if (!category) return null;

  const confidence = typeof v.confidence === 'number' && Number.isFinite(v.confidence) ? v.confidence : 0;

  // Цитата обязана дословно встречаться в тексте: выдуманная цитата — верный
  // признак того, что модель пересказала свои ожидания, а не прочитала текст
  const quote =
    typeof v.quote === 'string' && v.quote.length >= 3 && sourceText.includes(v.quote) ? v.quote : null;

  if (confidence >= 0.85 && quote) return { action: 'reject', reason: category, quote };
  if (confidence >= 0.5) return { action: 'review', reason: category, quote };
  return { action: 'publish' };
}

/** Третий уровень целиком: запрос к модели + guard. */
export async function modelVerdict(text: string): Promise<TextVerdict | null> {
  const answer = await llmComplete(SYSTEM_PROMPT, text.slice(0, 6000));
  if (!answer) return null;
  try {
    return guardModelVerdict(JSON.parse(answer), text);
  } catch {
    // Модель ответила не-JSON: считаем, что третьего уровня не было
    return null;
  }
}

/**
 * Полное решение по тексту.
 *
 * Порядок важен: сначала дешёвые правила, потом модель. Если модели нет
 * (ключ не настроен, провайдер молчит), текст публикуется — но только тот,
 * что прошёл программные правила. Иначе отсутствие внешнего сервиса
 * останавливало бы всё сообщество.
 */
export async function moderateText(input: ProgrammaticInput): Promise<TextVerdict> {
  const programmatic = programmaticVerdict(input);
  if (programmatic) return programmatic;

  const model = await modelVerdict(input.text);
  return model ?? { action: 'publish' };
}
