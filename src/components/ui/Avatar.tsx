import { avatarUrl } from '@/lib/photos';

// Аватар: фото (avatarKey) или инициалы на нейтральной подложке. Убирает
// дублирование логики «фото-или-инициалы» (профиль/каталог/«ещё в городе»).
// Данные сериализуемы (RSC-safe). Чистый компонент.

export function Avatar({
  avatarKey,
  firstName,
  lastName,
  size = 40,
  rounded = 'full',
  className = '',
}: {
  avatarKey?: string | null;
  firstName: string;
  lastName: string;
  size?: number;
  /** 'media' — скруглённый прямоугольник: аватар как кадр, не как иконка */
  rounded?: 'full' | 'media';
  className?: string;
}) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  const style = { width: size, height: size };
  const shape = rounded === 'media' ? 'rounded-media' : 'rounded-full';
  if (avatarKey) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl(avatarKey)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={`shrink-0 ${shape} object-cover ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.round(size * 0.4) }}
      className={`grid shrink-0 place-items-center ${shape} bg-surface-2 font-semibold text-ink-2 ${className}`}
    >
      {initials}
    </span>
  );
}
