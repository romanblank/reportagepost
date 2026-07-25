import { Avatar } from '@/components/ui/Avatar';
import { VerifiedBadge, TierBadge } from '@/components/ui/Badge';
import type { Tier } from '@/lib/subscription';

// Иммерсивный герой профиля (работа впереди метаданных). Кинематографичная
// обложка из лучшего кадра автора + имя/факты поверх. Серверный компонент —
// только сериализуемые данные (RSC-safe). Интерактив — в панели действий ниже.
export function ProfileHero({
  coverSrc,
  avatarKey,
  firstName,
  lastName,
  username,
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
  return (
    <section className="relative isolate w-full overflow-hidden bg-ink"
      style={{ height: 'clamp(340px, 54vh, 560px)' }}>
      {coverSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverSrc} alt="" aria-hidden
          className="absolute inset-0 h-full w-full scale-105 object-cover" />
      ) : (
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 90% at 50% 15%, var(--recognition) 0%, #241a0e 45%, #0a0a0d 100%)' }} />
      )}
      {/* Скрим: читаемость имени снизу + лёгкое затемнение сверху под шапку */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/45" />

      <div className="absolute inset-x-0 bottom-0">
        <div className="anim-rise mx-auto flex max-w-5xl items-end gap-4 px-4 pb-6 sm:gap-5 sm:pb-8">
          <Avatar avatarKey={avatarKey} firstName={firstName} lastName={lastName} size={88}
            className="shrink-0 ring-2 ring-white/80 ring-offset-2 ring-offset-black/20" />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-3xl font-semibold leading-[1.05] text-white drop-shadow-sm sm:text-5xl"
              style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>
              <span className="[text-wrap:balance]">{firstName} {lastName}</span>
              {verified && <VerifiedBadge label={verifiedHint} size={24} />}
              {tier !== 'FREE' && <TierBadge tier={tier} label={tierLabel} />}
            </h1>
            <p className="mt-1.5 text-sm text-white/80 sm:text-[15px]">
              @{username} · {cityName}{categories.length ? ` · ${categories.join(' · ')}` : ''}
            </p>
            {(facts.length > 0 || photosCount > 0 || onlineText) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-white/90">
                {facts.map((f) => (
                  <span key={f} className="rounded-full bg-white/15 px-2.5 py-1 backdrop-blur-sm">{f}</span>
                ))}
                {photosCount > 0 && (
                  <span className="rounded-full bg-white/15 px-2.5 py-1 backdrop-blur-sm tnum">{photosCount} {photosLabel}</span>
                )}
                {onlineText && <span className="pl-1 text-white/65">{onlineText}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
