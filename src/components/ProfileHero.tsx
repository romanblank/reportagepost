import { Avatar } from '@/components/ui/Avatar';
import { CoverShowreel } from '@/components/CoverShowreel';
import { VerifiedBadge, TierBadge } from '@/components/ui/Badge';
import type { Tier } from '@/lib/subscription';

/**
 * Обложка профиля по прототипу v9 (scratchpad/designs/v9-profile.html).
 *
 * Прежняя версия занимала 68vh и была почти пустой: имя, кредит — и всё.
 * В прототипе обложка компактнее (58vh), но плотнее по смыслу: рядом с именем
 * стоит аватар-кадром, статусная строка отвечает на вопросы заказчика ещё до
 * скролла («личность подтверждена · город · в съёмке с 2014 · отвечает ~2 ч»),
 * а жанры показаны чипами. Заказчик решает по этим четырём фактам, стоит ли
 * читать дальше — поэтому они и вынесены на первый экран.
 */
export function ProfileHero({
  coverSrc,
  showreelSrc,
  avatarKey,
  firstName,
  lastName,
  role,
  cityName,
  categories,
  verified,
  verifiedHint,
  verifiedLabel,
  tier,
  tierLabel,
  sinceText,
  replyText,
}: {
  coverSrc: string | null;
  /**
   * Живая обложка — перк верхнего уровня подписки. Не «ещё один слот», а то,
   * что заказчик видит с первого экрана: работа автора в движении вместо
   * статичного кадра.
   */
  showreelSrc: string | null;
  avatarKey: string | null;
  firstName: string;
  lastName: string;
  role: string;
  cityName: string;
  categories: string[];
  verified: boolean;
  verifiedHint: string;
  verifiedLabel: string;
  tier: Tier;
  tierLabel: string;
  /** «в съёмке с 2014» — если известен стаж */
  sinceText: string | null;
  /** «отвечает ~2 ч» — если есть данные об активности */
  replyText: string | null;
}) {
  return (
    <section className="relative isolate w-full overflow-hidden bg-paper"
      style={{ height: 'clamp(400px, 58svh, 620px)' }}>
      {showreelSrc ? (
        // Обложка играет беззвучно и зациклено: это фон, а не медиаплеер —
        // управления нет, звук не включается, полноценный ролик ниже на странице.
        // Решение «играть или показать кадр» принимает клиент: на телефоне и
        // при просьбе уменьшить движение остаётся статичная обложка.
        <CoverShowreel src={showreelSrc} poster={coverSrc}
          className="brand-grade absolute inset-0 h-full w-full object-cover"
          style={{ filter: 'brightness(.62)' }} />
      ) : coverSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverSrc} alt="" aria-hidden fetchPriority="high" decoding="async"
          className="brand-grade absolute inset-0 h-full w-full object-cover"
          style={{ filter: 'brightness(.62)' }} />
      ) : (
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 90% at 50% 15%, var(--recognition) 0%, #241a0e 45%, #0a0a0d 100%)' }} />
      )}
      {/* Скрим уводит низ кадра в фон страницы — обложка и контент срастаются */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(0deg, var(--paper) 2%, rgba(15,18,24,.35) 40%, rgba(15,18,24,.5) 100%)' }} />

      <div className="absolute inset-x-0 bottom-0 z-[3]">
        <div className="anim-rise mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-7 sm:flex-row sm:items-end sm:gap-6 sm:px-6">
          {/* Аватар кадром, а не кружком: у фотографа лицо — тоже работа */}
          <Avatar avatarKey={avatarKey} firstName={firstName} lastName={lastName} size={112}
            rounded="media"
            className="shrink-0 border-2 border-white/25 shadow-[0_14px_40px_rgba(0,0,0,.5)]" />

          <div className="min-w-0 flex-1">
            <p className="t-caption" style={{ color: 'var(--recognition-hi)', fontFamily: 'var(--font-mono)' }}>
              {role}
            </p>

            <h1 className="t-h1 mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-white">
              <span className="[text-wrap:balance]">{firstName} {lastName}</span>
              {tier !== 'FREE' && <span className="self-center"><TierBadge tier={tier} label={tierLabel} /></span>}
            </h1>

            {/* Статусная строка: то, что заказчик проверяет прежде всего */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 t-small text-white/80">
              {verified && (
                <span className="inline-flex items-center gap-1.5 text-verified">
                  <VerifiedBadge label={verifiedHint} size={15} />
                  {verifiedLabel}
                </span>
              )}
              {verified && <span className="size-[3px] rounded-full bg-white/40" />}
              <span>{cityName}</span>
              {sinceText && <><span className="size-[3px] rounded-full bg-white/40" /><span>{sinceText}</span></>}
              {replyText && <><span className="size-[3px] rounded-full bg-white/40" /><span>{replyText}</span></>}
            </div>

            {categories.length > 0 && (
              <div className="mt-3.5 flex flex-wrap gap-2">
                {categories.map((c) => (
                  <span key={c}
                    className="rounded-full border border-white/15 bg-surface/60 px-3 py-1 text-[12.5px] text-white backdrop-blur-sm">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
