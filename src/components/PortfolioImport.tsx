'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

/**
 * Перенос портфолио по ссылке (кабинет).
 *
 * Собрать портфолио заново — главный барьер входа фотографа: работы уже лежат
 * на его сайте. Здесь он даёт ссылку, отмечает свои кадры и переносит их.
 *
 * Выбор осознанный: по умолчанию не отмечено ничего. Автор подтверждает, что
 * работы его, — а дальше кадры идут обычным путём через модерацию.
 */
export function PortfolioImport({ categories }: { categories: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [found, setFound] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [categorySlug, setCategorySlug] = useState(categories[0]?.slug ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const errorLabels = {
    import_bad_url: ru.importPortfolio.errBadUrl,
    import_blocked_host: ru.importPortfolio.errBlockedHost,
    import_unreachable: ru.importPortfolio.errUnreachable,
    import_no_images: ru.importPortfolio.errNoImages,
    import_too_large: ru.importPortfolio.errTooLarge,
  };

  async function scan() {
    setBusy(true);
    setError(null);
    setReport(null);
    const res = await apiFetch<{ images: string[] }>(`/api/profile/import?url=${encodeURIComponent(url.trim())}`, {
      codeLabels: errorLabels,
      fallback: ru.importPortfolio.errGeneric,
    });
    setBusy(false);
    if (!res.ok) {
      setFound(null);
      setError(res.error);
      return;
    }
    setFound(res.data.images);
    setPicked(new Set());
  }

  function toggle(src: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  }

  async function pull() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ added: unknown[]; skipped: { reason: string }[] }>('/api/profile/import', {
      method: 'POST',
      body: { urls: [...picked], categorySlug },
      timeoutMs: 180_000,
      codeLabels: errorLabels,
      fallback: ru.importPortfolio.errGeneric,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Пропущенные кадры называем по причине: «перенесли 4 из 6» без объяснения
    // выглядит как сбой, хотя чаще это дубли или чужие работы
    setReport(ru.importPortfolio.report(res.data.added.length, res.data.skipped.map((s) => s.reason)));
    setPicked(new Set());
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[260px] flex-1">
          <span className="field-label">{ru.importPortfolio.urlLabel}</span>
          <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder={ru.importPortfolio.urlPlaceholder} className="field-input" />
        </label>
        <button type="button" onClick={scan} disabled={busy || url.trim().length < 8}
          className="btn btn-outline">{busy ? ru.importPortfolio.scanning : ru.importPortfolio.scanCta}</button>
      </div>
      <p className="field-hint mt-2">{ru.importPortfolio.hint}</p>
      {error && <p className="field-error">{error}</p>}
      {report && <p className="t-small mt-2 text-verified">{report}</p>}

      {found && found.length > 0 && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="t-small">{ru.importPortfolio.foundCount(found.length, picked.size)}</p>
            <div className="flex items-center gap-2">
              <label className="t-small">
                <span className="sr-only">{ru.importPortfolio.categoryLabel}</span>
                <select value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} className="field-input">
                  {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </label>
              <button type="button" onClick={pull} disabled={busy || picked.size === 0}
                className="btn btn-primary">{ru.importPortfolio.pullCta(picked.size)}</button>
            </div>
          </div>

          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {found.map((src) => {
              const isPicked = picked.has(src);
              return (
                <li key={src}>
                  <button type="button" onClick={() => toggle(src)}
                    aria-pressed={isPicked}
                    className={`block w-full overflow-hidden rounded-media border-2 transition ${isPicked ? 'border-recognition' : 'border-line opacity-70 hover:opacity-100'}`}>
                    {/* Чужой домен — next/image здесь неприменим (нужен whitelist
                        хостов, а адрес произвольный), поэтому обычный img */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" loading="lazy" className="aspect-[4/5] w-full bg-surface object-cover" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
