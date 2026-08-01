'use client';

import { useState } from 'react';
import { apiFetch, UPLOAD_TIMEOUT_MS } from '@/lib/api';
import { ru } from '@/i18n/ru';
import { useToast } from '@/components/ui/Toast';

interface Photo { id: string; thumb: string }
type SubTier = 'FREE' | 'PRIME' | 'ELITE';
interface Props {
  profileId: string;
  initialStatus: 'DRAFT' | 'PENDING' | 'NEEDS_REVISION' | 'APPROVED' | 'REJECTED';
  categories: { slug: string; name: string }[];
  initialPhotos: Photo[];
  initialTier: SubTier;
}

export function AdminPhotographerManager({ profileId, initialStatus, categories, initialPhotos, initialTier }: Props) {
  const { toast } = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [photos, setPhotos] = useState(initialPhotos);
  const [cat, setCat] = useState(categories[0]?.slug ?? '');
  const [tier, setTier] = useState<SubTier>(initialTier);
  const [busy, setBusy] = useState(false);

  async function grant(t: 'PRIME' | 'ELITE') {
    setBusy(true);
    const res = await apiFetch(`/api/admin/photographers/${profileId}/grant-pro?tier=${t}`, { method: 'POST' });
    setBusy(false);
    if (!res?.ok) return toast(ru.ui.toastError, 'danger');
    setTier(t);
  }

  async function togglePublish() {
    setBusy(true);
    const action = status === 'APPROVED' ? 'unpublish' : 'publish';
    const res = await apiFetch(`/api/admin/photographers/${profileId}`, { method: 'PATCH', body: { action } });
    setBusy(false);
    if (!res.ok) return toast(res.error, 'danger');
    setStatus((res.data as { status: 'DRAFT' | 'PENDING' | 'NEEDS_REVISION' | 'APPROVED' | 'REJECTED' }).status);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('categorySlug', cat);
    const res = await apiFetch(`/api/admin/photographers/${profileId}/photos`, {
      method: 'POST', body: fd, timeoutMs: UPLOAD_TIMEOUT_MS,
    });
    setBusy(false);
    if (!res.ok) {
      // Дубликат — отдельный текст: это не сбой, а осмысленный отказ
      return toast(res.status === 409 ? ru.adminPhotographers.dupError : ru.adminPhotographers.uploadError, 'danger');
    }
    const d = res.data as { photoId: string; thumbUrl: string };
    setPhotos((p) => [{ id: d.photoId, thumb: d.thumbUrl }, ...p]);
  }

  const STATUS_LABEL: Record<string, string> = {
    APPROVED: ru.adminPhotographers.statusApproved,
    DRAFT: ru.adminPhotographers.statusDraft,
    PENDING: ru.adminPhotographers.statusPending,
    NEEDS_REVISION: ru.adminPhotographers.statusPending,
    REJECTED: ru.adminPhotographers.statusRejected,
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${status === 'APPROVED' ? 'bg-success-soft text-success' : 'bg-surface-2 muted'}`}>
          {STATUS_LABEL[status]}
        </span>
        <button type="button" onClick={togglePublish} disabled={busy}
          className={`btn btn-sm ${status === 'APPROVED' ? 'btn-outline' : 'btn-accent'}`}>
          {status === 'APPROVED' ? ru.adminPhotographers.unpublish : ru.adminPhotographers.toPublish}
        </button>
        <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${tier === 'FREE' ? 'bg-surface-2 muted' : 'bg-recognition-soft text-recognition'}`}>
          {tier === 'FREE' ? ru.adminPhotographers.tierFree : ru.pro.tierName[tier]}
        </span>
        {tier !== 'PRIME' && (
          <button type="button" onClick={() => grant('PRIME')} disabled={busy} className="btn btn-outline btn-sm">
            {ru.adminPhotographers.grantPrime}
          </button>
        )}
        {tier !== 'ELITE' && (
          <button type="button" onClick={() => grant('ELITE')} disabled={busy} className="btn btn-outline btn-sm">
            {ru.adminPhotographers.grantElite}
          </button>
        )}
      </div>

      <div className="mt-6">
        <div className="flex items-end justify-between gap-3">
          <h2 className="t-h3">{ru.adminPhotographers.photosTitle} · {photos.length}</h2>
          <div className="flex items-center gap-2">
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="input h-9 w-auto py-1 text-sm">
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
            <label className={`btn btn-accent btn-sm ${busy ? 'opacity-50' : 'cursor-pointer'}`}>
              {busy ? ru.adminPhotographers.uploading : ru.adminPhotographers.uploadPhoto}
              <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={onFile} />
            </label>
          </div>
        </div>
        {photos.length === 0 ? (
          <p className="mt-4 text-sm muted">{ru.adminPhotographers.noPhotos}</p>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.thumb} alt="" loading="lazy" className="aspect-square w-full rounded-media object-cover" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
