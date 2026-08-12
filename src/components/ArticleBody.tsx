/**
 * Тело статьи: абзацы, подзаголовки, списки и выделение.
 *
 * Раньше текст выводился как есть, и разметка доезжала до читателя сырыми
 * символами: «## Что спрашивать» и «**Время на площадке**». Автор пишет
 * длинный материал, и без подзаголовков он читается сплошной стеной — значит
 * разметка нужна, а раз нужна, её надо разбирать, а не показывать.
 *
 * Свой разбор, а не библиотека: нам хватает четырёх правил, и любой парсер
 * markdown — это ещё и HTML на входе, то есть чужой код в статье, которую
 * пишет пользователь. Здесь HTML невозможен в принципе: мы не вставляем
 * разметку строкой, а строим узлы React.
 */
type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string };

function parse(body: string): Block[] {
  const blocks: Block[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list });
      list = [];
    }
  };

  for (const raw of body.split('\n')) {
    const line = raw.trim();

    if (line.length === 0) {
      flushList();
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      blocks.push({ kind: 'heading', text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('— ')) {
      list.push(line.slice(2).trim());
      continue;
    }
    flushList();
    blocks.push({ kind: 'paragraph', text: line });
  }
  flushList();
  return blocks;
}

/** Выделение внутри строки: **жирный**. Возвращает узлы, а не HTML. */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={`${keyPrefix}-${i}`} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    ),
  );
}

export function ArticleBody({ body }: { body: string }) {
  const blocks = parse(body);

  return (
    <div className="mt-6 flex flex-col gap-4">
      {blocks.map((b, i) => {
        if (b.kind === 'heading') {
          return (
            <h2 key={i} className="t-h3 mt-4 text-balance">
              {b.text}
            </h2>
          );
        }
        if (b.kind === 'list') {
          return (
            <ul key={i} className="flex flex-col gap-1.5 pl-1">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-2 t-body">
                  <span aria-hidden className="text-muted">—</span>
                  <span>{inline(item, `${i}-${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="t-body leading-relaxed">
            {inline(b.text, String(i))}
          </p>
        );
      })}
    </div>
  );
}
