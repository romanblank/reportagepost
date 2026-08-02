import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { formatRubMinor } from '@/lib/money';
import { ShowPhoneButton } from '@/components/ShowPhoneButton';

export interface BookingFact {
  label: string;
  value: string;
}

/**
 * Панель обращения к автору (прототип v9): цена, действия, параметры работы и
 * занятость на месяц — липким блоком справа.
 *
 * Раньше всё это было размазано по странице: цены отдельной секцией внизу,
 * контакты строкой под шапкой, календарь занятости не показывался вовсе, хотя
 * данные есть. Заказчик выбирает по трём вещам — «сколько», «свободен ли на мою
 * дату» и «как связаться»; панель держит их на экране, пока он смотрит работы.
 */
export function ProfileBooking({
  profileId,
  username,
  fromPriceMinor,
  facts,
  busyDays,
  monthLabel,
  daysInMonth,
  firstWeekday,
  canShowPhone,
}: {
  profileId: string;
  username: string;
  /** Минимальный пакет — «съёмка события от …». null у авторов без цен. */
  fromPriceMinor: number | null;
  facts: BookingFact[];
  /** Дни месяца (1..31), отмеченные автором как занятые */
  busyDays: number[];
  monthLabel: string;
  daysInMonth: number;
  /** День недели 1-го числа: 0 — понедельник */
  firstWeekday: number;
  canShowPhone: boolean;
}) {
  const busy = new Set(busyDays);

  return (
    <aside className="lg:sticky lg:top-[74px]">
      <div className="card p-5 shadow-[0_20px_50px_rgba(0,0,0,.35)]">
        {fromPriceMinor != null && (
          <p className="text-[13px] muted">
            {ru.profile.bookingFrom}
            <b className="mt-1 block text-3xl font-normal text-ink" style={{ fontFamily: 'var(--font-display)' }}>
              {formatRubMinor(fromPriceMinor)}
            </b>
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2.5">
          <Link href={`/ru/inquiry?photographer=${username}`} className="btn btn-accent w-full py-3">
            {ru.profile.sendInquiry}
          </Link>
          {canShowPhone && <ShowPhoneButton profileId={profileId} />}
        </div>

        {facts.length > 0 && (
          <dl className="mt-5 flex flex-col gap-2.5 border-t border-line pt-4 text-[13.5px]">
            {facts.map((f) => (
              <div key={f.label} className="flex justify-between gap-3">
                <dt className="muted">{f.label}</dt>
                <dd className="text-right">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Занятость — самый частый вопрос заказчика с датой на руках.
            Данные есть в календаре автора, но на профиле не показывались. */}
        <div className="mt-4 border-t border-line pt-4">
          <p className="t-caption muted" style={{ fontFamily: 'var(--font-mono)' }}>
            {ru.profile.bookingBusyTitle} · {monthLabel}
          </p>
          <div className="mt-3 grid grid-cols-7 gap-[5px]">
            {ru.profile.weekdayShort.map((d, i) => (
              <span key={`${d}-${i}`} className="text-center text-[10px] muted">{d}</span>
            ))}
            {Array.from({ length: firstWeekday }, (_, i) => <span key={`pad-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const isBusy = busy.has(day);
              return (
                <span key={day}
                  className={`grid aspect-square place-items-center rounded-[5px] text-[11px] ${
                    isBusy
                      ? 'bg-accent/15 text-accent line-through'
                      : 'bg-surface-2 text-verified'
                  }`}>
                  {day}
                </span>
              );
            })}
          </div>
          <p className="mt-2.5 flex gap-4 text-[11.5px] muted">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block size-[9px] rounded-[3px] bg-verified/50" />{ru.profile.bookingFree}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block size-[9px] rounded-[3px] bg-accent/50" />{ru.profile.bookingBusy}
            </span>
          </p>
        </div>
      </div>
    </aside>
  );
}
