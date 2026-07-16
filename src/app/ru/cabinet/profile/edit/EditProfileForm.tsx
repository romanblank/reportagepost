'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';
import { describeApiError } from '@/lib/form-errors';
import { normalizePhone, normalizeUrl } from '@/lib/phone-format';

interface Initial {
  username: string;
  citySlug: string;
  categorySlugs: string[];
  bio: string;
  siteUrl: string;
  whatsapp: string;
  telegram: string;
  experienceYears: number | null;
  equipment: string;
  teamInfo: string;
  languages: string[];
  faq: { q: string; a: string }[];
  packages: { hours: number; priceRub: number }[];
}

const LANGS = ['ru', 'en', 'es', 'de', 'fr', 'it', 'zh', 'tr'];

export function EditProfileForm({ initial, avatar, cities, categories }: {
  initial: Initial; avatar: string | null;
  cities: { slug: string; name: string }[];
  categories: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(avatar);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarErr, setAvatarErr] = useState(false);
  const [username, setUsername] = useState(initial.username);
  const [citySlug, setCitySlug] = useState(initial.citySlug);
  const [cats, setCats] = useState<string[]>(initial.categorySlugs);
  const [bio, setBio] = useState(initial.bio);
  const [siteUrl, setSiteUrl] = useState(initial.siteUrl);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [telegram, setTelegram] = useState(initial.telegram);
  const [exp, setExp] = useState(initial.experienceYears?.toString() ?? '');
  const [equipment, setEquipment] = useState(initial.equipment);
  const [teamInfo, setTeamInfo] = useState(initial.teamInfo);
  const [langs, setLangs] = useState<string[]>(initial.languages.length ? initial.languages : ['ru']);
  const [faq, setFaq] = useState(initial.faq);
  const [packages, setPackages] = useState(initial.packages.length ? initial.packages : [{ hours: 2, priceRub: 10000 }]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    if (cats.length === 0) { setPending(false); setError(ru.onboarding.needCategory); return; }
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.trim().toLowerCase(),
        citySlug,
        categorySlugs: cats,
        bio: bio.trim(),
        siteUrl: siteUrl.trim() ? normalizeUrl(siteUrl.trim()) : '',
        whatsapp: whatsapp.trim() ? normalizePhone(whatsapp.trim()) : '',
        telegram: telegram.trim(),
        experienceYears: exp.trim() ? Number(exp) : null,
        equipment: equipment.trim(),
        teamInfo: teamInfo.trim(),
        languages: langs,
        faq: faq.map((f) => ({ q: f.q.trim(), a: f.a.trim() })).filter((f) => f.q && f.a).slice(0, 10),
        packages: packages.map((p) => ({ hours: p.hours, priceMinor: p.priceRub * 100, currency: 'RUB' })),
      }),
    }).catch(() => null);
    setPending(false);
    if (res?.ok) {
      setSaved(true);
      router.refresh();
      return;
    }
    setError(await describeApiError(res, {
      codeLabels: {
        username_taken: ru.adminPhotographers.errUsernameTaken,
        city_not_found: ru.onboarding.needCategory,
        category_not_found: ru.onboarding.needCategory,
      },
      fallback: ru.inquiry.errorGeneric,
    }));
  }

  async function uploadAvatar(file: File | null) {
    if (!file) return;
    setAvatarBusy(true);
    setAvatarErr(false);
    const fd = new FormData();
    fd.set('file', file);
    const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd }).catch(() => null);
    setAvatarBusy(false);
    if (res?.ok) {
      setAvatarUrl(URL.createObjectURL(file)); // мгновенное превью
      router.refresh();
    } else {
      setAvatarErr(true);
    }
  }

  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-5">
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-muted">?</span>
        )}
        <div>
          <span className="field-label block">{ru.editProfile.avatar}</span>
          <label className={`btn btn-outline mt-1 px-3 py-1.5 text-sm ${avatarBusy ? 'opacity-50' : 'cursor-pointer'}`}>
            {avatarBusy ? ru.editProfile.avatarUploading : ru.editProfile.avatarUpload}
            <input type="file" accept="image/*" className="sr-only" disabled={avatarBusy}
              onChange={(e) => uploadAvatar(e.target.files?.[0] ?? null)} />
          </label>
          {avatarErr && <span className="ml-2 text-xs text-accent">{ru.editProfile.avatarError}</span>}
        </div>
      </div>

      <div>
        <div>
          <label className="field-label">{ru.onboarding.username}</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="input"
            pattern="[a-z0-9][a-z0-9\-]{2,29}" />
          <span className="field-hint">{ru.onboarding.usernameHint}</span>
        </div>
        <div>
          <label className="field-label">{ru.adminPhotographers.city}</label>
          <select value={citySlug} onChange={(e) => setCitySlug(e.target.value)} className="input">
            {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">{ru.adminPhotographers.categories}</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button type="button" key={c.slug}
                onClick={() => setCats((prev) => prev.includes(c.slug) ? prev.filter((s) => s !== c.slug) : prev.length < 3 ? [...prev, c.slug] : prev)}
                className={`chip ${cats.includes(c.slug) ? 'chip-active' : ''}`}>{c.name}</button>
            ))}
          </div>
        </div>

        <label className="field-label">{ru.onboarding.bio}</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="input" maxLength={2000} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label">{ru.onboarding.experience}</label>
          <input value={exp} onChange={(e) => setExp(e.target.value)} type="number" min={0} max={70} inputMode="numeric" className="input w-28" />
        </div>
        <div>
          <span className="field-label">{ru.onboarding.languages}</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {LANGS.map((l) => (
              <label key={l} className={`chip ${langs.includes(l) ? 'chip-active' : ''}`}>
                <input type="checkbox" className="sr-only" checked={langs.includes(l)}
                  onChange={() => setLangs((p) => p.includes(l) ? p.filter((x) => x !== l) : [...p, l])} />
                {ru.profile.langName[l] ?? l}
              </label>
            ))}
          </div>
        </div>
        <div><label className="field-label">{ru.onboarding.equipment}</label>
          <input value={equipment} onChange={(e) => setEquipment(e.target.value)} maxLength={500} className="input" /></div>
        <div><label className="field-label">{ru.onboarding.team}</label>
          <input value={teamInfo} onChange={(e) => setTeamInfo(e.target.value)} maxLength={300} className="input" /></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="field-label">{ru.onboarding.siteUrl}</label>
          <input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} className="input" /></div>
        <div><label className="field-label">{ru.onboarding.whatsapp}</label>
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="input" /></div>
        <div><label className="field-label">{ru.onboarding.telegram}</label>
          <input value={telegram} onChange={(e) => setTelegram(e.target.value)} className="input" /></div>
      </div>

      <fieldset>
        <legend className="field-label">{ru.editProfile.faqTitle}</legend>
        <div className="mt-1 flex flex-col gap-3">
          {faq.map((f, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <div className="flex items-center gap-2">
                <input value={f.q} onChange={(e) => setFaq((prev) => prev.map((x, j) => j === i ? { ...x, q: e.target.value } : x))}
                  placeholder={ru.editProfile.faqQuestion} maxLength={200} className="input" />
                <button type="button" onClick={() => setFaq((prev) => prev.filter((_, j) => j !== i))}
                  className="btn btn-ghost px-2 py-1.5 text-sm">✕</button>
              </div>
              <textarea value={f.a} onChange={(e) => setFaq((prev) => prev.map((x, j) => j === i ? { ...x, a: e.target.value } : x))}
                placeholder={ru.editProfile.faqAnswer} rows={2} maxLength={1000} className="input" />
            </div>
          ))}
        </div>
        {faq.length < 10 && (
          <button type="button" onClick={() => setFaq((p) => [...p, { q: '', a: '' }])}
            className="btn btn-outline mt-3 px-3 py-1.5">{ru.editProfile.faqAdd}</button>
        )}
      </fieldset>

      <fieldset>
        <legend className="field-label">{ru.onboarding.packagesTitle}</legend>
        <div className="mt-1 flex flex-col gap-2">
          {packages.map((p, i) => (
            <div key={i} className="flex items-end gap-3">
              <div><label className="field-hint">{ru.onboarding.hours}</label>
                <input type="number" min={1} max={24} value={p.hours || ''} className="input w-20"
                  onChange={(e) => setPackages((prev) => prev.map((x, j) => j === i ? { ...x, hours: Number(e.target.value) } : x))} /></div>
              <div><label className="field-hint">{ru.onboarding.priceRub}</label>
                <input type="number" min={1} value={p.priceRub || ''} className="input w-32"
                  onChange={(e) => setPackages((prev) => prev.map((x, j) => j === i ? { ...x, priceRub: Number(e.target.value) } : x))} /></div>
              {packages.length > 1 && (
                <button type="button" onClick={() => setPackages((prev) => prev.filter((_, j) => j !== i))}
                  className="btn btn-ghost px-2 py-1.5 text-sm">✕</button>
              )}
            </div>
          ))}
        </div>
        {packages.length < 6 && (
          <button type="button" className="btn btn-outline mt-3 px-3 py-1.5" onClick={() => setPackages((p) => [...p, { hours: 4, priceRub: 20000 }])}>
            {ru.onboarding.addPackage}
          </button>
        )}
      </fieldset>

      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      {saved && <p className="text-sm text-accent">{ru.editProfile.saved}</p>}
      <button type="submit" disabled={pending} className="btn btn-accent w-fit px-5 py-2.5">
        {pending ? ru.editProfile.saving : ru.editProfile.save}
      </button>
    </form>
  );
}
