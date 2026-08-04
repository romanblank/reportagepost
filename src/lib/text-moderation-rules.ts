/**
 * Правила автомодерации без модели.
 *
 * Вынесены отдельным модулем, чтобы их мог импортировать и КЛИЕНТ: подсказки
 * во время набора обязаны совпадать с тем, что решит сервер. Разъехавшиеся
 * формулировки хуже отсутствия подсказок — человек следует совету и всё равно
 * получает отказ.
 *
 * Общая картина автомодерации текста: сообщения форума, статьи, комментарии.
 *
 * Модераторов у платформы нет и не будет в ближайшее время, поэтому система
 * обязана решать сама. Отсюда единственное требование, из которого следует всё
 * остальное: решение должно быть таким, чтобы человек с ним согласился. Отказ
 * без объяснения хуже пропущенной грубости — он делает врага из того, кто
 * пришёл участвовать.
 *
 * Три уровня, в порядке дешевизны:
 *
 *  1. Подсказки ДО отправки — самая эффективная модерация та, которой не
 *     понадобилось. Правила показываются, пока человек пишет (см. клиентскую
 *     часть, использующую эти же функции).
 *  2. Программные правила — быстро, предсказуемо, объяснимо. Ловят контакты,
 *     ссылки, капслок, флуд, повтор.
 *  3. Языковая модель — только там, где правила бессильны: оскорбление без
 *     мата, травля, скрытая реклама. Вердикт модели НИКОГДА не применяется
 *     напрямую: решение принимает программный guard по порогам.
 *
 * Без ключа модели третий уровень отключается, и это не деградация до
 * «пропускаем всё»: первые два уровня работают всегда, а неоднозначное
 * попадает не в публикацию, а в очередь на ручной просмотр.
 */

export type ModerationReasonCode =
  | 'contacts'
  | 'external_link'
  | 'shouting'
  | 'too_short'
  | 'repeat'
  | 'flood'
  | 'insult'
  | 'harassment'
  | 'hidden_ad'
  | 'off_topic'
  | 'unsafe';

export type TextVerdict =
  | { action: 'publish' }
  | { action: 'reject'; reason: ModerationReasonCode; quote: string | null }
  /** Спорное: не публикуем и не отказываем — отправляем человеку. */
  | { action: 'review'; reason: ModerationReasonCode; quote: string | null };

export type TextKind = 'thread' | 'post' | 'article' | 'comment';

const MIN_LENGTH: Record<TextKind, number> = { thread: 40, post: 10, article: 400, comment: 2 };
export const MAX_LENGTH: Record<TextKind, number> = { thread: 8000, post: 8000, article: 40_000, comment: 1000 };

// Телефоны в любом виде, включая «восемь девятьсот» словами — последнее ловит
// не регулярка, а третий уровень
const PHONE_RE = /(?:\+?\d[\s\-()]?){10,}/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
// Мессенджеры пишут по-разному, но всегда с ником рядом
const MESSENGER_RE = /(?:telegram|телеграм|тг|whatsapp|вотсап|ватсап|вайбер|viber)[\s:,-]*@?[\w_]{3,}/i;
const URL_RE = /(?:https?:\/\/|www\.)[^\s]+|\b[\w-]+\.(?:ru|com|net|org|io|me|рф)\b/i;

/** Свои адреса ссылкой не считаем: внутренние ссылки — это польза, а не увод. */
const OWN_HOST_RE = /(?:^|\/\/|\s)(?:www\.)?reportagepost\.com/i;

function stripOwnLinks(text: string): string {
  return text.replace(new RegExp(OWN_HOST_RE.source + '\\S*', 'gi'), ' ');
}

/** Доля прописных среди букв — капслок кричит и читается как агрессия. */
function shoutingRatio(text: string): number {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 20) return 0;
  const upper = letters.replace(/[^\p{Lu}]/gu, '').length;
  return upper / letters.length;
}

export type ProgrammaticInput = {
  text: string;
  kind: TextKind;
  /** Тексты того же автора за последнее время — для повтора и флуда. */
  recent?: string[];
};

/**
 * Второй уровень: правила без модели.
 *
 * Возвращает null, если правила ничего не нашли, — тогда решает третий
 * уровень. Каждый вердикт несёт цитату: человек должен видеть, к чему
 * претензия, иначе исправлять он будет наугад.
 */
export function programmaticVerdict({ text, kind, recent = [] }: ProgrammaticInput): TextVerdict | null {
  const trimmed = text.trim();

  if (trimmed.length < MIN_LENGTH[kind]) {
    return { action: 'reject', reason: 'too_short', quote: null };
  }

  const body = stripOwnLinks(trimmed);

  const phone = body.match(PHONE_RE)?.[0] ?? null;
  const email = body.match(EMAIL_RE)?.[0] ?? null;
  const messenger = body.match(MESSENGER_RE)?.[0] ?? null;
  if (phone || email || messenger) {
    // Контакты в публичном тексте — это не только правило площадки: открытый
    // номер собирают роботы, и страдает от этого автор, а не мы
    return { action: 'reject', reason: 'contacts', quote: phone ?? email ?? messenger };
  }

  const url = body.match(URL_RE)?.[0] ?? null;
  if (url) return { action: 'reject', reason: 'external_link', quote: url };

  if (shoutingRatio(trimmed) > 0.6) {
    return { action: 'reject', reason: 'shouting', quote: trimmed.slice(0, 80) };
  }

  // Повтор — тот же текст, отправленный снова: обычно это не злой умысел, а
  // двойное нажатие или попытка «поднять» тему
  const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
  if (recent.some((r) => r.toLowerCase().replace(/\s+/g, ' ') === normalized)) {
    return { action: 'reject', reason: 'repeat', quote: null };
  }

  // Флуд: много сообщений подряд за короткое время считает вызывающий код и
  // передаёт сюда как переполненный recent
  if (kind !== 'article' && recent.length >= 10) {
    return { action: 'reject', reason: 'flood', quote: null };
  }

  return null;
}

