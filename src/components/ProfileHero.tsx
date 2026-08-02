import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge, TierBadge } from '@/components/ui/Badge';
import type { Tier } from '@/lib/subscription';

/**
 * Шапка профиля — «разворот журнала» (арт-дирекшн, visual-identity §9 п.8).
 *
 * Прежняя версия была продуктовой карточкой: имя набрано `text-3xl
 * font-semibold` с инлайновым font-family (спека прямо запрещает зашитые
 * размеры вместо типо-ролей), факты — «пилюлями» на полупрозрачном стекле.
 * Пилюли и стекло — регистр дашборда; для медиа о людях и событиях это ложный
 * сигнал, ровно тот, из-за которого страница читалась как «ещё один сайт».
 *
 * Здесь: имя крупной антиквой через `.t-display`, кикер и метаданные —
 * моноширинным в стиле контактного листа (`ЖАНР · ГОРОД · ГОД`), строка
 * признания латунью, у медиа острые углы. Кадр автора занимает экран и
 * работает первым — метаданные подчинены ему, а не наоборот.
 */
export function ProfileHero({
  coverSrc,
  avatarKey,
  firstName,
  lastName,
  username,
  role,
  cityName,
  categories,
  verified,
  verifiedHint,
  tier,
  tierLabel,
  photosCount,
  photosLabel,
  facts,
  onlineText,
}: {
  coverSrc: string | null;
  avatarKey: string | null;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
  cityName: string;
  categories: string[];
  verified: boolean;
  verifiedHint: string;
  tier: Tier;
  tierLabel: string;
  photosCount: number;
  photosLabel: string;
  facts: string[];
  onlineText: string | null;
}) {
  // Подпись в духе контактного листа: жанр · город · число работ.
  // Верхний регистр и разрядка делают её меткой документа, а не текстом.
  const credit = [categories[0], cityName].filter(Boolean).join(' · ');

  return (
    <section className="relative isolate w-full overflow-hidden bg-paper"
      style={{ height: 'clamp(420px, 68vh, 720px)' }}>
      {coverSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverSrc} alt="" aria-hidden
          className="brand-grade absolute inset-0 h-full w-full scale-[1.04] object-cover" />
      ) : (
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 90% at 50% 15%, var(--recognition) 0%, #241a0e 45%, #0a0a0d 100%)' }} />
      )}

      {/* Скрим держит читаемость имени и уводит кадр в тень к низу разворота */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(6,7,10,.92) 0%, rgba(6,7,10,.55) 34%, rgba(6,7,10,.12) 62%, rgba(6,7,10,.45) 100%)' }} />

      <div className="absolute inset-x-0 bottom-0">
        <div className="anim-rise mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6 sm:pb-12">
          {/* Кикер: роль автора набрана как метка документа */}
          <p className="t-caption" style={{ color: 'var(--recognition-hi)', fontFamily: 'var(--font-mono)' }}>
            {role}
          </p>

          <h1 className="t-display mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-white">
            <span className="[text-wrap:balance]">{firstName} {lastName}</span>
            <span className="flex items-center gap-2 self-center">
              {verified && <VerifiedBadge label={verifiedHint} size={22} />}
              {tier !== 'FREE' && <TierBadge tier={tier} label={tierLabel} />}
            </span>
          </h1>

          {/* Кредит под именем — как подпись под кадром в издании */}
          {credit && (
            <p className="mt-3 t-caption text-white/75" style={{ fontFamily: 'var(--font-mono)' }}>
              {credit}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/15 pt-4">
            <span className="flex items-center gap-3">
              <Avatar avatarKey={avatarKey} firstName={firstName} lastName={lastName} size={44}
                className="shrink-0 ring-1 ring-white/30" />
              <span className="text-sm text-white/80" style={{ fontFamily: 'var(--font-mono)' }}>@{username}</span>
            </span>

            {/* Факты — сухим списком через разделители, без «пилюль»:
                достижение читается как строка выходных данных, а не как тег */}
            {facts.map((f) => (
              <span key={f} className="text-sm text-white/85">{f}</span>
            ))}
            {photosCount > 0 && (
              <span className="tnum text-sm text-white/70" style={{ fontFamily: 'var(--font-mono)' }}>
                {photosCount} {photosLabel}
              </span>
            )}
            {onlineText && <span className="text-sm text-white/55">{onlineText}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
