'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';
import { apiFetch } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';

export type HandlingState = 'IN_PROGRESS' | 'DECLINED' | null;

/**
 * Карточка входящей заявки (аудит 2026-08-01, P2).
 *
 * Это момент, ради которого построен весь продукт: фотограф получил клиента.
 * Раньше контакт выводился обычным текстом в склейке через « · » — позвонить
 * с телефона в один тап было нельзя, надо было выделять номер из строки. Второй
 * контакт (если были оба) не показывался вовсе, абзацы описания схлопывались,
 * а повторный вход в кабинет не показывал, какие заявки уже отработаны — лиды
 * терялись при том, что доведение заявки до сделки и есть метрика №1.
 */
export function InquiryCard({
  inquiryId,
  contactName,
  contactPhone,
  contactEmail,
  clientUserId,
  description,
  meta,
  initialHandling,
}: {
  inquiryId: string;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  clientUserId: string | null;
  description: string;
  /** Город · жанр · дата · бюджет — собирается на сервере, здесь только показ. */
  meta: { place: string; details: string };
  initialHandling: HandlingState;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [handling, setHandling] = useState<HandlingState>(initialHandling);
  const [busy, setBusy] = useState(false);

  async function mark(state: HandlingState) {
    if (busy) return;
    setBusy(true);
    const prev = handling;
    setHandling(state);
    const res = await apiFetch('/api/inquiries/handling', {
      method: 'PATCH',
      body: { inquiryId, state },
    });
    setBusy(false);
    if (!res.ok) {
      setHandling(prev);
      toast(res.error, 'danger');
      return;
    }
    router.refresh();
  }

  const dimmed = handling === 'DECLINED';

  return (
    <li className={`card p-4 text-sm transition-opacity ${dimmed ? 'opacity-55' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{contactName}</span>
        <span className="opacity-60">{meta.place}</span>
      </div>

      {/* Абзацы клиента сохраняем: в них обычно и лежит суть съёмки */}
      <p className="mt-1 whitespace-pre-wrap">{description}</p>

      {meta.details && <p className="mt-2 muted">{meta.details}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {contactPhone && (
          <a href={`tel:${contactPhone}`} className="btn btn-accent btn-sm">
            <Icon name="phone" size={15} /> {contactPhone}
          </a>
        )}
        {contactEmail && (
          <a href={`mailto:${contactEmail}`} className="btn btn-outline btn-sm">
            <Icon name="mail" size={15} /> {contactEmail}
          </a>
        )}
        {clientUserId && (
          <a href={`/ru/messages/${clientUserId}`} className="btn btn-outline btn-sm">
            <Icon name="message" size={15} /> {ru.cabinet.inquiryChat}
          </a>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {handling === null ? (
          <>
            <button type="button" onClick={() => void mark('IN_PROGRESS')} disabled={busy} aria-busy={busy}
              className="btn btn-ghost btn-sm disabled:opacity-60">
              {ru.cabinet.inquiryTake}
            </button>
            <button type="button" onClick={() => void mark('DECLINED')} disabled={busy} aria-busy={busy}
              className="btn btn-ghost btn-sm disabled:opacity-60">
              {ru.cabinet.inquiryDecline}
            </button>
          </>
        ) : (
          <>
            <span className="rounded-full bg-surface-2 px-3 py-1 text-xs">
              {handling === 'IN_PROGRESS' ? ru.cabinet.inquiryTaken : ru.cabinet.inquiryDeclined}
            </span>
            <button type="button" onClick={() => void mark(null)} disabled={busy} aria-busy={busy}
              className="btn btn-ghost btn-sm disabled:opacity-60">
              {ru.cabinet.inquiryUndo}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
