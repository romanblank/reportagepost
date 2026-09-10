'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';

// Заказчик отмечает, что съёмка с автором состоялась — честный якорь доверия.
export function ConfirmShootButton({ profileId, initialConfirmed, authed }: {
  profileId: string;
  initialConfirmed: boolean;
  authed: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [busy, setBusy] = useState(false);
  // Дата не обязательна, но без неё вторая съёмка с тем же заказчиком
  // считается повтором первой
  const [eventDate, setEventDate] = useState('');
  const [open, setOpen] = useState(false);

  async function confirm() {
    if (!authed) {
      router.push('/ru/login');
      return;
    }
    setBusy(true);
    const res = await apiFetch('/api/shoots/confirm', {
      method: 'POST',
      body: { profileId, ...(eventDate ? { eventDate } : {}) },
      codeLabels: {
        shoot_no_contact: ru.profile.shootNoContact,
        shoot_email_unverified: ru.profile.shootEmailUnverified,
        shoot_already_marked: ru.profile.shootAlreadyMarked,
      },
      fallback: ru.ui.toastError,
    });
    setBusy(false);
    if (res.ok) {
      setConfirmed(true);
      toast(ru.profile.shootMarked, 'success');
      router.refresh();
    } else {
      toast(res.error, 'danger');
    }
  }

  if (confirmed) {
    return (
      <span className="inline-flex items-center gap-1.5 t-small font-medium text-recognition">
        <Icon name="check" size={16} /> {ru.profile.shootConfirmed}
      </span>
    );
  }
  // Дата раскрывается ПО НАЖАТИЮ (design-polish, волна 1): вечно торчащий
  // «дд.мм.гггг» в ряду кнопок читался как сломанная форма и шумел для
  // каждого гостя. Паттерн: кнопка → шаг с датой (необязательной) → отправка.
  // Дата по-прежнему важна: именно она отличает вторую съёмку от повтора
  // первой — без неё факт «заказчики возвращаются» не появится никогда.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => (authed ? setOpen(true) : router.push('/ru/login'))}
        className="btn btn-outline btn-sm"
        title={ru.profile.confirmShootHint}
      >
        <Icon name="check" size={16} /> {ru.profile.confirmShoot}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className="inline-flex items-center gap-1.5">
        <span className="t-fine muted">{ru.profile.shootDateLabel}</span>
        <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          aria-label={ru.profile.shootDateLabel} className="field-input py-1 t-small" />
      </label>
      <button type="button" onClick={confirm} disabled={busy} className="btn btn-accent btn-sm">
        {ru.ui.send}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">
        {ru.ui.cancel}
      </button>
    </span>
  );
}
