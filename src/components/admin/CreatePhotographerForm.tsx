'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { ru } from '@/i18n/ru';

interface Option { slug: string; name: string }

export function CreatePhotographerForm({ cities, categories }: { cities: Option[]; categories: Option[] }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; profileId: string } | null>(null);
  const [cats, setCats] = useState<string[]>([]);

  function toggleCat(slug: string) {
    setCats((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : prev.length < 3 ? [...prev, slug] : prev));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (cats.length === 0) { setError(ru.adminPhotographers.errCategory); return; }
    setPending(true); setError(null);
    const f = new FormData(e.currentTarget);
    const num = (v: FormDataEntryValue | null) => (v && String(v).trim() ? Number(v) : undefined);
    const str = (v: FormDataEntryValue | null) => { const s = v ? String(v).trim() : ''; return s || undefined; };
    const res = await apiFetch('/api/admin/photographers', { method: 'POST', body: {
        firstName: str(f.get('firstName')), lastName: str(f.get('lastName')),
        email: str(f.get('email')), username: str(f.get('username')),
        citySlug: f.get('citySlug'), categorySlugs: cats,
        bio: str(f.get('bio')), experienceYears: num(f.get('experienceYears')),
        equipment: str(f.get('equipment')), teamInfo: str(f.get('teamInfo')),
        whatsapp: str(f.get('whatsapp')), telegram: str(f.get('telegram')), siteUrl: str(f.get('siteUrl')),
        publish: f.get('publish') === 'on',
      },
      codeLabels: {
        email_taken: ru.adminPhotographers.errEmailTaken,
        username_taken: ru.adminPhotographers.errUsernameTaken,
      },
      fallback: ru.adminPhotographers.errGeneric,
    });
    setPending(false);
    if (res.ok) { setCreated(res.data as { username: string; profileId: string }); return; }
    setError(res.error);
  }

  if (created) {
    return (
      <div className="card p-5">
        <p className="font-medium">{ru.adminPhotographers.created}: @{created.username}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href={`/ru/admin/photographers/${created.profileId}`} className="btn btn-accent btn-sm">{ru.adminPhotographers.manage} · {ru.adminPhotographers.uploadPhoto}</Link>
          <Link href={`/ru/photographer/${created.username}`} className="btn btn-outline btn-sm">{ru.adminPhotographers.openProfile}</Link>
          <button type="button" onClick={() => { setCreated(null); setCats([]); }} className="btn btn-ghost btn-sm">{ru.adminPhotographers.createTitle}</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="field-label">{ru.adminPhotographers.firstName}</label><input name="firstName" required minLength={2} className="input" /></div>
        <div><label className="field-label">{ru.adminPhotographers.lastName}</label><input name="lastName" required minLength={2} className="input" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="field-label">{ru.adminPhotographers.email}</label><input name="email" type="email" className="input" /></div>
        <div><label className="field-label">{ru.adminPhotographers.username}</label><input name="username" required pattern="[a-z0-9][a-z0-9\-]{2,29}" className="input" placeholder="ivan-petrov" /></div>
      </div>
      <div>
        <label className="field-label">{ru.adminPhotographers.city}</label>
        <select name="citySlug" required className="input">
          {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="field-label">{ru.adminPhotographers.categories}</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button type="button" key={c.slug} onClick={() => toggleCat(c.slug)}
              className={`chip ${cats.includes(c.slug) ? 'chip-active' : ''}`}>{c.name}</button>
          ))}
        </div>
      </div>
      <div><label className="field-label">{ru.adminPhotographers.bio}</label><textarea name="bio" rows={3} maxLength={2000} className="input" /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="field-label">{ru.adminPhotographers.experience}</label><input name="experienceYears" type="number" min={0} max={70} className="input" /></div>
        <div className="col-span-2"><label className="field-label">{ru.adminPhotographers.equipment}</label><input name="equipment" className="input" /></div>
      </div>
      <div><label className="field-label">{ru.adminPhotographers.team}</label><input name="teamInfo" className="input" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="field-label">{ru.adminPhotographers.whatsapp}</label><input name="whatsapp" className="input" placeholder="+7999…" /></div>
        <div><label className="field-label">{ru.adminPhotographers.telegram}</label><input name="telegram" className="input" placeholder="@nick" /></div>
      </div>
      <div><label className="field-label">{ru.adminPhotographers.site}</label><input name="siteUrl" className="input" placeholder="https://" /></div>
      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="publish" className="h-4 w-4 accent-[var(--accent)]" />
        <span>{ru.adminPhotographers.publish}</span>
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={pending} className="btn btn-accent w-fit">{pending ? ru.adminPhotographers.creating : ru.adminPhotographers.submit}</button>
    </form>
  );
}
