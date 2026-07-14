'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { describeApiError } from '@/lib/form-errors';
import { normalizePhone, normalizeUrl } from '@/lib/phone-format';
import { ONBOARDING_PHOTOS_MAX, ONBOARDING_PHOTOS_MIN, MIN_LONG_SIDE } from '@/lib/photos-constants';

interface Option {
  slug: string;
  nameRu: string;
}

type Step = 'profile' | 'photos' | 'done';

export function OnboardingForm({ cities, categories }: { cities: Option[]; categories: Option[] }) {
  const [step, setStep] = useState<Step>('profile');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState([{ hours: 2, priceRub: 10000 }]);
  const [chosenCats, setChosenCats] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState(0);
  const [username, setUsername] = useState('');
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const thumbsRef = useRef<string[]>([]);
  thumbsRef.current = thumbs;

  // Освобождаем blob-URL ТОЛЬКО при размонтировании (не при каждом добавлении —
  // иначе уничтожили бы URL ещё показываемых превью)
  useEffect(() => () => { thumbsRef.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  // Слаг адреса страницы: строчная латиница/цифры/дефис — устраняет ловушку
  // «ввёл имя с пробелом → непонятная ошибка» (фидбэк оператора 2026-07-14)
  function slugify(v: string): string {
    return v.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+/, '').slice(0, 30);
  }

  const PHOTO_ERRORS: Record<string, string> = {
    too_small: 'слишком маленькое разрешение (нужна длинная сторона от 2400px)',
    not_image: 'это не изображение',
    file_too_large: 'файл больше 40 МБ',
    photo_limit: 'достигнут лимит фото',
    category_not_in_profile: 'категория не выбрана в анкете',
    no_profile: 'сначала сохраните анкету',
    validation: 'проверьте файл',
  };

  const FIELD_NAMES: Record<string, string> = {
    username: ru.onboarding.fieldUsername,
    citySlug: ru.onboarding.fieldCity,
    categorySlugs: ru.onboarding.fieldCategories,
    packages: ru.onboarding.fieldPackages,
    siteUrl: ru.onboarding.fieldSiteUrl,
    whatsapp: ru.onboarding.fieldWhatsapp,
    telegram: ru.onboarding.fieldTelegram,
    bio: ru.onboarding.fieldBio,
  };

  async function submitProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        citySlug: f.get('citySlug'),
        categorySlugs: chosenCats,
        bio: String(f.get('bio') ?? '').trim() || undefined,
        siteUrl: (() => { const v = String(f.get('siteUrl') ?? '').trim(); return v ? normalizeUrl(v) : undefined; })(),
        whatsapp: (() => { const v = String(f.get('whatsapp') ?? '').trim(); return v ? normalizePhone(v) : undefined; })(),
        telegram: String(f.get('telegram') ?? '').trim() || undefined,
        packages: packages.map((p) => ({ hours: p.hours, priceMinor: p.priceRub * 100, currency: 'RUB' })),
      }),
    }).catch(() => null);
    setPending(false);
    if (res?.status === 201) {
      setStep('photos');
      return;
    }
    if (res?.status === 409) {
      const body = await res.json().catch(() => null);
      if (body?.error === 'profile_exists') { setStep('photos'); return; }
    }
    setError(await describeApiError(res, {
      codeLabels: { username_taken: ru.onboarding.errUsernameTaken, city_not_found: 'Выберите город из списка' },
      fieldLabels: FIELD_NAMES,
      fallback: ru.inquiry.errorGeneric,
    }));
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length || !chosenCats.length) return;
    setError(null);
    const list = Array.from(files);
    setPending(true);
    setUploadProgress({ done: 0, total: list.length });
    let done = 0;
    for (const file of list) {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('categorySlug', chosenCats[0]);
      const res = await fetch('/api/profile/photos', { method: 'POST', body: fd }).catch(() => null);
      if (res?.status === 201) {
        const body = await res.json();
        setUploaded(body.uploaded);
        setThumbs((prev) => [...prev, URL.createObjectURL(file)]); // локальное превью
      } else {
        const body = res ? await res.json().catch(() => null) : null;
        const code = body?.error as string | undefined;
        const msg = PHOTO_ERRORS[code ?? ''] ?? body?.message ?? 'не удалось загрузить';
        setError(ru.onboarding.errPhoto(`${file.name}: ${msg}`));
        if (code === 'photo_limit') break;
      }
      done += 1;
      setUploadProgress({ done, total: list.length });
    }
    setUploadProgress(null);
    setPending(false);
  }

  if (step === 'done') {
    return (
      <div className="card p-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm text-accent">✓ {ru.onboarding.doneTitle}</div>
        <p className="mt-3 text-sm muted">{ru.onboarding.doneText}</p>
        <Link href="/ru/cabinet" className="btn btn-accent mt-3">
          {ru.onboarding.toCabinet}
        </Link>
      </div>
    );
  }

  if (step === 'photos') {
    const remaining = Math.max(0, ONBOARDING_PHOTOS_MIN - uploaded);
    const pct = uploadProgress ? Math.round((uploadProgress.done / uploadProgress.total) * 100) : 0;
    return (
      <section>
        <h2 className="text-lg font-medium">{ru.onboarding.photosTitle}</h2>
        <p className="mt-1 text-sm opacity-60">
          {ru.onboarding.photosHint(ONBOARDING_PHOTOS_MIN, ONBOARDING_PHOTOS_MAX, MIN_LONG_SIDE)}
        </p>

        <p className="mt-3 text-sm font-medium">{ru.onboarding.uploaded(uploaded, ONBOARDING_PHOTOS_MAX)}</p>
        {remaining > 0 && !uploadProgress && (
          <p className="text-sm opacity-60">{ru.onboarding.needMore(remaining)}</p>
        )}

        {/* Живой прогресс загрузки пачки (skeleton-полоса, не спиннер) */}
        {uploadProgress && (
          <div className="mt-2">
            <p className="text-sm">{ru.onboarding.uploadingN(uploadProgress.done, uploadProgress.total)}</p>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Превью загруженных */}
        {thumbs.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-1 sm:grid-cols-6">
            {thumbs.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" className="aspect-square w-full rounded object-cover" />
            ))}
            {uploadProgress && Array.from({ length: uploadProgress.total - uploadProgress.done }).map((_, i) => (
              <div key={`sk-${i}`} className="aspect-square w-full animate-pulse rounded bg-black/10 dark:bg-white/10" />
            ))}
          </div>
        )}

        <label className={`btn btn-outline mt-3 ${pending ? 'opacity-50' : 'cursor-pointer'}`}>
          {pending ? ru.onboarding.uploadingBtn : ru.onboarding.uploadBtn}
          <input type="file" accept="image/*" multiple className="hidden" disabled={pending}
            onChange={(e) => uploadPhotos(e.target.files)} />
        </label>
        {error && <p role="alert" className="mt-2 text-sm text-accent">{error}</p>}

        <button
          onClick={() => setStep('done')}
          disabled={uploaded < ONBOARDING_PHOTOS_MIN || pending}
          className="btn btn-accent mt-4"
        >
          {ru.onboarding.finish}
        </button>
        {uploaded < ONBOARDING_PHOTOS_MIN && (
          <p className="mt-1 text-xs opacity-50">{ru.onboarding.finishHint(ONBOARDING_PHOTOS_MIN)}</p>
        )}
      </section>
    );
  }

  return (
    <form onSubmit={submitProfile} className="flex flex-col gap-5">
      <div>
        <label className="field-label">{ru.onboarding.username}</label>
        <input
          name="username"
          required
          value={username}
          onChange={(e) => setUsername(slugify(e.target.value))}
          placeholder="roman-blank"
          className="input"
        />
        <span className="field-hint">{ru.onboarding.usernameHint}</span>
        <span className="field-hint opacity-70">{ru.onboarding.usernamePreview(username)}</span>
      </div>
      <div>
        <label className="field-label">{ru.onboarding.city}</label>
        <select name="citySlug" required className="input">
          {cities.map((c) => <option key={c.slug} value={c.slug}>{c.nameRu}</option>)}
        </select>
      </div>
      <fieldset>
        <legend className="field-label">{ru.onboarding.categories}</legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <label key={c.slug} className={`chip ${chosenCats.includes(c.slug) ? 'chip-active' : ''}`}>
              <input type="checkbox" className="sr-only" checked={chosenCats.includes(c.slug)}
                onChange={() => setChosenCats((prev) =>
                  prev.includes(c.slug) ? prev.filter((s) => s !== c.slug) : prev.length < 3 ? [...prev, c.slug] : prev)} />
              {c.nameRu}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="field-label">{ru.onboarding.bio}</label>
        <textarea name="bio" rows={3} className="input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="field-label">{ru.onboarding.siteUrl}</label>
          <input name="siteUrl" type="url" className="input" /></div>
        <div><label className="field-label">{ru.onboarding.whatsapp}</label>
          <input name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 900 000-00-00" className="input" /></div>
        <div><label className="field-label">{ru.onboarding.telegram}</label>
          <input name="telegram" placeholder="@username" className="input" /></div>
      </div>
      <fieldset>
        <legend className="field-label">{ru.onboarding.packagesTitle}</legend>
        <div className="flex flex-col gap-2">
          {packages.map((p, i) => (
            <div key={i} className="flex items-end gap-3">
              <div><label className="field-hint">{ru.onboarding.hours}</label>
                <input type="number" min={1} max={24} step={1} value={p.hours || ''} required className="input w-20"
                  onChange={(e) => setPackages((prev) => prev.map((x, j) => j === i ? { ...x, hours: Number(e.target.value) } : x))} /></div>
              <div><label className="field-hint">{ru.onboarding.priceRub}</label>
                <input type="number" min={1} step={1} value={p.priceRub || ''} required className="input w-32"
                  onChange={(e) => setPackages((prev) => prev.map((x, j) => j === i ? { ...x, priceRub: Number(e.target.value) } : x))} /></div>
            </div>
          ))}
        </div>
        {packages.length < 6 && (
          <button type="button" className="btn btn-outline mt-3 px-3 py-1.5"
            onClick={() => setPackages((p) => [...p, { hours: 4, priceRub: 20000 }])}>
            {ru.onboarding.addPackage}
          </button>
        )}
      </fieldset>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      {chosenCats.length === 0 && <p className="text-sm muted">{ru.onboarding.needCategory}</p>}
      <button type="submit" disabled={pending || chosenCats.length === 0} className="btn btn-accent">
        {ru.onboarding.submitProfile}
      </button>
    </form>
  );
}
