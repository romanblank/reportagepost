'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';
import { CATEGORIES } from '@/lib/category-data';
import { STORY_MIN_PHOTOS as MIN, STORY_MAX_PHOTOS as MAX } from '@/lib/stories-constants';
import { useToast } from '@/components/ui/Toast';

export interface ComposerPhoto {
  id: string;
  thumb: string;
}

// Сборка серии (репортаж с одного события) из одобренных кадров портфолио.
// Перк Active. Отправка → модерация редакции.
export function StoryComposer({ photos }: { photos: ComposerPhoto[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categorySlug, setCategorySlug] = useState(CATEGORIES[0]?.slug ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (n.size < MAX) n.add(id);
      return n;
    });

  const canSubmit = title.trim().length >= 3 && selected.size >= MIN && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    const res = await apiFetch('/api/stories', {
      method: 'POST',
      body: {
        title: title.trim(),
        description: description.trim() || undefined,
        categorySlug,
        photoIds: [...selected],
      },
    });
    setBusy(false);
    if (res.ok) {
      toast(ru.cabinetStories.created, 'success');
      setTitle('');
      setDescription('');
      setSelected(new Set());
      router.refresh();
    } else {
      toast(ru.cabinetStories.error, 'danger');
    }
  }

  if (photos.length < MIN) {
    return <p className="mt-4 t-small muted">{ru.cabinetStories.needPhotos(MIN)}</p>;
  }

  return (
    <div className="mt-4">
      <label className="block">
        <span className="field-hint mt-0">{ru.cabinetStories.titleLabel}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
          placeholder={ru.cabinetStories.titlePlaceholder} className="input mt-1 w-full" />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-hint mt-0">{ru.cabinetStories.categoryLabel}</span>
          <select value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} className="input mt-1 w-full">
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.nameRu}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="field-hint mt-0">{ru.cabinetStories.descLabel}</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000}
            placeholder={ru.cabinetStories.descPlaceholder} className="input mt-1 w-full" />
        </label>
      </div>

      <p className="mt-4 field-hint">{ru.cabinetStories.pickLabel(selected.size, MIN)}</p>
      <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.map((p) => {
          const on = selected.has(p.id);
          const order = on ? [...selected].indexOf(p.id) + 1 : null;
          return (
            <li key={p.id}>
              <button type="button" onClick={() => toggle(p.id)}
                className={`relative block w-full overflow-hidden rounded-md ring-2 transition ${on ? 'ring-recognition' : 'ring-transparent hover:ring-line-2'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                {on && (
                  <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-recognition text-[11px] font-semibold text-recognition-ink">{order}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <button type="button" onClick={submit} disabled={!canSubmit} className="btn btn-accent mt-5 px-6 py-2.5">
        {busy ? ru.cabinetStories.submitting : ru.cabinetStories.submit}
      </button>
    </div>
  );
}
