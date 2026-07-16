import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { HERO_SHOTS, heroImageUrl } from '@/lib/hero-images';

// Полноэкранная брендовая сцена входа/регистрации: слева репортажный кадр в
// кино-грейде с манифестом, справа — форма. Без маркетингового хрома (см. Chrome).
export function AuthScene({ children }: { children: React.ReactNode }) {
  const shot = HERO_SHOTS[0];
  return (
    <div className="as-root">
      <aside className="as-visual" style={{ backgroundImage: `url(${heroImageUrl(shot)})` }} aria-hidden="true">
        <div className="as-scrim" />
        <Link href="/" className="as-brand as-brand-light">
          <span className="as-dot" />Reportage Post
        </Link>
        <div className="as-manifest">
          <p className="as-kicker">{ru.footer.tagline}</p>
          <p className="as-title">{ru.landing.heroTitle}</p>
        </div>
      </aside>

      <main className="as-form">
        <Link href="/" className="as-brand as-brand-dark">
          <span className="as-dot" />Reportage Post
        </Link>
        <div className="as-inner">{children}</div>
      </main>

      <style>{`
        .as-root { min-height: 100svh; display: grid; grid-template-columns: 1fr; background: var(--paper); }
        @media (min-width: 900px) { .as-root { grid-template-columns: 1.05fr 1fr; } }
        .as-visual { display: none; position: relative; background-size: cover; background-position: center;
          filter: grayscale(.42) contrast(1.05) brightness(.5) sepia(.06); }
        @media (min-width: 900px) { .as-visual { display: block; } }
        .as-scrim { position: absolute; inset: 0; background:
          linear-gradient(to top, rgba(10,10,11,.85), rgba(10,10,11,.15) 55%, rgba(10,10,11,.5)); }
        .as-brand { position: relative; z-index: 2; display: inline-flex; align-items: center; gap: 9px;
          font-weight: 700; font-size: 16px; letter-spacing: -.01em; text-decoration: none; }
        .as-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--accent); }
        .as-brand-light { position: absolute; top: 30px; left: 34px; color: #fff; }
        .as-brand-light .as-dot { box-shadow: 0 0 12px var(--accent); }
        .as-manifest { position: absolute; z-index: 2; left: 34px; right: 34px; bottom: 34px; }
        .as-kicker { font-size: 11px; letter-spacing: .2em; text-transform: uppercase; font-weight: 600; color: var(--recognition-hi); margin: 0 0 14px; }
        .as-title { font-family: var(--font-cormorant), Georgia, serif; font-weight: 600; color: #fff;
          font-size: clamp(30px, 3.4vw, 52px); line-height: 1.04; letter-spacing: -.01em; margin: 0; max-width: 14ch; }
        .as-form { display: flex; flex-direction: column; padding: clamp(28px, 5vw, 56px); }
        .as-brand-dark { color: var(--ink); }
        @media (min-width: 900px) { .as-brand-dark { display: none; } }
        .as-inner { flex: 1; display: flex; flex-direction: column; justify-content: center;
          width: 100%; max-width: 380px; margin: 0 auto; padding: 40px 0; }
      `}</style>
    </div>
  );
}
