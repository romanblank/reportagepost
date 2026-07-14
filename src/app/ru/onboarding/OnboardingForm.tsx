'use client';

import { useState } from 'react';
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
    for (const file of Array.from(files)) {
      setPending(true);
      const fd = new FormData();
      fd.set('file', file);
      fd.set('categorySlug', chosenCats[0]);
      const res = await fetch('/api/profile/photos', { method: 'POST', body: fd }).catch(() => null);
      setPending(false);
      if (res?.status === 201) {
        const body = await res.json();
        setUploaded(body.uploaded);
      } else {
        const body = res ? await res.json().catch(() => null) : null;
        const code = body?.error as string | undefined;
        const msg = PHOTO_ERRORS[code ?? ''] ?? body?.message ?? 'не удалось загрузить';
        setError(ru.onboarding.errPhoto(msg));
        if (code === 'photo_limit') break;
      }
    }
  }

  if (step === 'done') {
    return (
      <div className="rounded-lg border border-green-600 p-4">
        <p className="font-medium">{ru.onboarding.doneTitle}</p>
        <p className="mt-1 text-sm opacity-70">{ru.onboarding.doneText}</p>
        <Link href="/ru/cabinet" className="mt-3 inline-block rounded-lg bg-foreground px-4 py-2 text-sm text-background">
          {ru.onboarding.toCabinet}
        </Link>
      </div>
    );
  }

  if (step === 'photos') {
    return (
      <section>
        <h2 className="text-lg font-medium">{ru.onboarding.photosTitle}</h2>
        <p className="mt-1 text-sm opacity-60">
          {ru.onboarding.photosHint(ONBOARDING_PHOTOS_MIN, ONBOARDING_PHOTOS_MAX, MIN_LONG_SIDE)}
        </p>
        <p className="mt-3 text-sm">{ru.onboarding.uploaded(uploaded, ONBOARDING_PHOTOS_MAX)}</p>
        <label className="mt-2 inline-block cursor-pointer rounded-lg border px-4 py-2 text-sm">
          {ru.onboarding.uploadBtn}
          <input type="file" accept="image/*" multiple className="hidden" disabled={pending}
            onChange={(e) => uploadPhotos(e.target.files)} />
        </label>
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        {uploaded >= ONBOARDING_PHOTOS_MIN && (
          <button onClick={() => setStep('done')} className="mt-4 block rounded-lg bg-foreground px-4 py-2 text-background">
            {ru.onboarding.finish}
          </button>
        )}
      </section>
    );
  }

  return (
    <form onSubmit={submitProfile} className="flex flex-col gap-3">
      <label className="text-sm">
        {ru.onboarding.username}
        <input
          name="username"
          required
          value={username}
          onChange={(e) => setUsername(slugify(e.target.value))}
          placeholder="roman-blank"
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
        <span className="mt-1 block text-xs opacity-50">{ru.onboarding.usernameHint}</span>
        <span className="mt-0.5 block text-xs opacity-40">{ru.onboarding.usernamePreview(username)}</span>
      </label>
      <label className="text-sm">
        {ru.onboarding.city}
        <select name="citySlug" required className="mt-1 w-full rounded-lg border px-3 py-2">
          {cities.map((c) => <option key={c.slug} value={c.slug}>{c.nameRu}</option>)}
        </select>
      </label>
      <fieldset className="text-sm">
        <legend>{ru.onboarding.categories}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {categories.map((c) => (
            <label key={c.slug} className={`cursor-pointer rounded-full border px-3 py-1 ${chosenCats.includes(c.slug) ? 'bg-foreground text-background' : ''}`}>
              <input type="checkbox" className="hidden" checked={chosenCats.includes(c.slug)}
                onChange={() => setChosenCats((prev) =>
                  prev.includes(c.slug) ? prev.filter((s) => s !== c.slug) : prev.length < 3 ? [...prev, c.slug] : prev)} />
              {c.nameRu}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-sm">
        {ru.onboarding.bio}
        <textarea name="bio" rows={3} className="mt-1 w-full rounded-lg border px-3 py-2" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">{ru.onboarding.siteUrl}
          <input name="siteUrl" type="url" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        <label className="text-sm">{ru.onboarding.whatsapp}
          <input name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 900 000-00-00" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        <label className="text-sm">{ru.onboarding.telegram}
          <input name="telegram" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
      </div>
      <fieldset className="text-sm">
        <legend>{ru.onboarding.packagesTitle}</legend>
        {packages.map((p, i) => (
          <div key={i} className="mt-1 flex gap-2">
            <label className="flex items-center gap-1">{ru.onboarding.hours}
              <input type="number" min={1} max={24} step={1} value={p.hours || ''} required className="w-16 rounded-lg border px-2 py-1"
                onChange={(e) => setPackages((prev) => prev.map((x, j) => j === i ? { ...x, hours: Number(e.target.value) } : x))} /></label>
            <label className="flex items-center gap-1">{ru.onboarding.priceRub}
              {/* step=1: HTML отсчитывает шаг от min — step=500 ломал круглые суммы (баг 2026-07-13).
                  value={x || ''} — иначе контролируемый 0 нельзя стереть */}
              <input type="number" min={1} step={1} value={p.priceRub || ''} required className="w-28 rounded-lg border px-2 py-1"
                onChange={(e) => setPackages((prev) => prev.map((x, j) => j === i ? { ...x, priceRub: Number(e.target.value) } : x))} /></label>
          </div>
        ))}
        {packages.length < 6 && (
          <button type="button" className="mt-2 rounded-lg border px-3 py-1 text-sm"
            onClick={() => setPackages((p) => [...p, { hours: 4, priceRub: 20000 }])}>
            {ru.onboarding.addPackage}
          </button>
        )}
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {chosenCats.length === 0 && <p className="text-sm opacity-60">{ru.onboarding.needCategory}</p>}
      <button type="submit" disabled={pending || chosenCats.length === 0}
        className="rounded-lg bg-foreground px-4 py-2 text-background disabled:opacity-50">
        {ru.onboarding.submitProfile}
      </button>
    </form>
  );
}
