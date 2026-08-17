'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';
import { useToast } from '@/components/ui/Toast';

/**
 * «Первые шаги» — что делать одобренному автору, пока нет заявок.
 *
 * Раньше после одобрения наступала тишина: нулевые счётчики и пустой список
 * заявок. Главный двигатель доверия — подтверждённая съёмка — на старте был
 * недостижим: отметить её можно только из переписки, а заказчики первых
 * авторов все вне платформы. Приглашение по ссылке возвращает им их же
 * репутацию (аудит 2026-08-16, продуктовый №8).
 */
export function FirstSteps({ username }: { username: string }) {
  const { toast } = useToast();
  const t = ru.firstSteps;
  const [inviteBusy, setInviteBusy] = useState(false);

  async function copyPageLink() {
    await navigator.clipboard.writeText(`https://reportagepost.com/ru/photographer/${username}`);
    toast(t.shareCopied, 'success');
  }

  async function copyInvite() {
    setInviteBusy(true);
    const res = await apiFetch<{ url: string }>('/api/shoots/invite', { method: 'POST' });
    setInviteBusy(false);
    if (!res.ok) return toast(ru.ui.toastError, 'danger');
    await navigator.clipboard.writeText(res.data.url);
    toast(t.inviteCopied, 'success');
  }

  return (
    <section className="card p-4">
      <p className="t-caption muted">{t.title}</p>
      <p className="mt-1 t-small">{t.lead}</p>
      <div className="mt-4 flex flex-col gap-4">
        <div>
          <p className="t-small font-medium">{t.shareTitle}</p>
          <p className="mt-0.5 t-small muted">{t.shareText}</p>
          <button type="button" onClick={copyPageLink} className="btn btn-outline btn-sm mt-2">
            {t.shareCta}
          </button>
        </div>
        <div>
          <p className="t-small font-medium">{t.inviteTitle}</p>
          <p className="mt-0.5 t-small muted">{t.inviteText}</p>
          <button type="button" onClick={copyInvite} disabled={inviteBusy} className="btn btn-accent btn-sm mt-2">
            {t.inviteCta}
          </button>
        </div>
        <div>
          <p className="t-small font-medium">{t.articleTitle}</p>
          <p className="mt-0.5 t-small muted">{t.articleText}</p>
          <Link href="/ru/cabinet/articles" className="btn btn-ghost btn-sm mt-2">
            {t.articleCta}
          </Link>
        </div>
      </div>
    </section>
  );
}
