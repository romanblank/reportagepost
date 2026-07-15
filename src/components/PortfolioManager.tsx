'use client';

import { useState } from 'react';
import { ru } from '@/i18n/ru';
import { Icon } from '@/components/ui/Icon';
import { StatusBadge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';

export interface PortfolioPhoto {
  id: string;
  thumb: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

const STATUS_KIND = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' } as const;
const STATUS_LABEL = {
  PENDING: ru.portfolio.statusPending,
  APPROVED: ru.portfolio.statusApproved,
  REJECTED: ru.portfolio.statusRejected,
} as const;

export function PortfolioManager({
  initialPhotos,
  initialCoverId,
}: {
  initialPhotos: PortfolioPhoto[];
  initialCoverId: string | null;
}) {
  const { toast } = useToast();
  const [photos, setPhotos] = useState(initialPhotos);
  const [coverId, setCoverId] = useState(initialCoverId);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function persistOrder(next: PortfolioPhoto[]) {
    const prev = photos;
    setPhotos(next);
    const res = await fetch('/api/profile/photos/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: next.map((p) => p.id) }),
    }).catch(() => null);
    if (!res?.ok) {
      setPhotos(prev);
      toast(ru.ui.toastError, 'danger');
    }
  }

  function move(index: number, delta: number) {
    const j = index + delta;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[index], next[j]] = [next[j], next[index]];
    void persistOrder(next);
  }

  async function del(id: string) {
    setConfirmId(null);
    setBusy(id);
    const res = await fetch(`/api/profile/photos/${id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return toast(ru.ui.toastError, 'danger');
    setPhotos((p) => p.filter((x) => x.id !== id));
    if (coverId === id) setCoverId(null);
    toast(ru.portfolio.deleted, 'success');
  }

  async function makeCover(id: string, status: PortfolioPhoto['status']) {
    if (status !== 'APPROVED') return toast(ru.portfolio.coverOnlyApproved, 'warning');
    setBusy(id);
    const res = await fetch('/api/profile/cover', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId: id }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return toast(ru.ui.toastError, 'danger');
    setCoverId(id);
    toast(ru.portfolio.coverSet, 'success');
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((p, i) => (
        <li key={p.id} className="card overflow-hidden">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumb} alt="" loading="lazy" className="aspect-square w-full object-cover" />
            <div className="absolute left-1.5 top-1.5 flex gap-1">
              <StatusBadge kind={STATUS_KIND[p.status]} label={STATUS_LABEL[p.status]} />
              {coverId === p.id && (
                <span className="tnum inline-flex items-center rounded-sm bg-ink px-2 py-0.5 text-xs font-medium text-paper">
                  {ru.portfolio.cover}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-1 p-2">
            <div className="flex gap-0.5">
              <button type="button" aria-label={ru.portfolio.moveUp} disabled={i === 0 || busy === p.id}
                onClick={() => move(i, -1)} className="btn btn-ghost btn-sm px-1.5 disabled:opacity-30">
                <Icon name="chevron-left" size={16} className="rotate-90" />
              </button>
              <button type="button" aria-label={ru.portfolio.moveDown} disabled={i === photos.length - 1 || busy === p.id}
                onClick={() => move(i, 1)} className="btn btn-ghost btn-sm px-1.5 disabled:opacity-30">
                <Icon name="chevron-right" size={16} className="rotate-90" />
              </button>
            </div>
            <div className="flex gap-0.5">
              {coverId !== p.id && (
                <button type="button" title={ru.portfolio.setCover} aria-label={ru.portfolio.setCover}
                  disabled={busy === p.id} onClick={() => makeCover(p.id, p.status)}
                  className="btn btn-ghost btn-sm px-1.5">
                  <Icon name="star" size={16} />
                </button>
              )}
              {confirmId === p.id ? (
                <button type="button" disabled={busy === p.id} onClick={() => del(p.id)}
                  className="btn btn-danger btn-sm px-2">{ru.portfolio.delete}</button>
              ) : (
                <button type="button" title={ru.portfolio.delete} aria-label={ru.portfolio.delete}
                  disabled={busy === p.id} onClick={() => setConfirmId(p.id)}
                  className="btn btn-ghost btn-sm px-1.5 text-danger">
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
