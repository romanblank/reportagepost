'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { HERO_SHOTS, heroImageUrl } from '@/lib/hero-images';

// Живой герой главной: полноэкранные репортажные кадры плавно перетекают с
// кино-зумом (Ken Burns). Единый грейд (grayscale/contrast/brightness) + скрим
// делают любой кадр читаемым под белым текстом и связывают разные фото в один
// сет. Заголовок собирается по словам. Уважает prefers-reduced-motion.

const HOLD_MS = 6000;

export function HeroWallpaper() {
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set([0]));

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % HERO_SHOTS.length), HOLD_MS);
    return () => clearInterval(t);
  }, []);

  // Прелоад следующего кадра
  useEffect(() => {
    const next = (idx + 1) % HERO_SHOTS.length;
    setLoaded((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }, [idx]);

  const words = ru.landing.heroTitle.split(' ');
  const active = HERO_SHOTS[idx];

  return (
    <section className="hw">
      <div className="hw-bg" aria-hidden="true">
        {HERO_SHOTS.map((s, i) => (
          <div
            key={s.id}
            className={`hw-layer${i === idx ? ' on' : ''}`}
            style={loaded.has(i) ? { backgroundImage: `url(${heroImageUrl(s)})` } : undefined}
          />
        ))}
        <div className="hw-grain" />
        <div className="hw-scrim" />
      </div>

      <div className="hw-inner">
        <p className="hw-kicker">{ru.landing.kicker}</p>
        <h1 className="hw-title">
          {words.map((w, i) => (
            <span key={i} className="hw-word" style={{ animationDelay: `${0.25 + i * 0.09}s` }}>
              {w}&nbsp;
            </span>
          ))}
        </h1>
        <p className="hw-lede">{ru.landing.heroLead}</p>
        <div className="hw-cta">
          <Link href="/ru/register" className="btn btn-accent btn-lg">{ru.landing.registerCta}</Link>
          <Link href="/ru/login" className="hw-ghost">{ru.landing.loginCta}</Link>
        </div>
        <p className="hw-note">{ru.landing.closedNote}</p>
      </div>

      <div className="hw-credit" aria-hidden="true">
        <span className="hw-dots">
          {HERO_SHOTS.map((_, i) => <i key={i} className={i === idx ? 'on' : ''} />)}
        </span>
        <span className="hw-cap">{active.kind} · {active.author} / Unsplash</span>
      </div>

      <style>{`
        .hw { position: relative; min-height: 100svh; display: flex; align-items: flex-end; overflow: hidden; background: #0a0a0b; }
        .hw-bg { position: absolute; inset: 0; z-index: 0; }
        .hw-layer {
          position: absolute; inset: 0; background-size: cover; background-position: center;
          opacity: 0; transform: scale(1.06);
          filter: grayscale(.4) contrast(1.06) brightness(.6) sepia(.08);
          transition: opacity 1.6s ease;
        }
        .hw-layer.on { opacity: 1; animation: hwKen ${HOLD_MS + 1600}ms ease-out forwards; }
        @keyframes hwKen { from { transform: scale(1.06); } to { transform: scale(1.16); } }
        .hw-grain {
          position: absolute; inset: 0; opacity: .5; mix-blend-mode: overlay; pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E");
        }
        .hw-scrim {
          position: absolute; inset: 0; pointer-events: none;
          background:
            radial-gradient(130% 90% at 78% 15%, rgba(10,10,11,0) 34%, rgba(10,10,11,.55) 100%),
            linear-gradient(to top, rgba(10,10,11,.94) 0%, rgba(10,10,11,.38) 44%, rgba(10,10,11,.12) 72%, rgba(10,10,11,.4) 100%);
        }
        .hw-inner {
          position: relative; z-index: 2; width: 100%; max-width: 1180px; margin: 0 auto;
          padding: 0 clamp(20px, 5vw, 48px) clamp(56px, 9vh, 120px);
        }
        .hw-kicker {
          font-size: 12px; letter-spacing: .24em; text-transform: uppercase; font-weight: 600;
          color: #f0c46e; margin: 0 0 22px; opacity: 0; transform: translateY(12px);
          animation: hwRise .7s .12s cubic-bezier(.16,1,.3,1) forwards;
        }
        .hw-title {
          font-family: var(--font-unbounded), system-ui, sans-serif; font-weight: 800;
          font-size: clamp(38px, 6.4vw, 92px); line-height: 1; letter-spacing: -.03em;
          margin: 0; max-width: 16ch; color: #fff; text-wrap: balance;
        }
        .hw-word { display: inline-block; opacity: 0; transform: translateY(26px); animation: hwRise .8s cubic-bezier(.16,1,.3,1) forwards; }
        .hw-lede {
          margin: 26px 0 0; font-size: clamp(15px, 1.5vw, 19px); line-height: 1.55; color: #d6d6db;
          max-width: 44ch; opacity: 0; transform: translateY(12px);
          animation: hwRise .7s .95s cubic-bezier(.16,1,.3,1) forwards;
        }
        .hw-cta {
          margin: 32px 0 0; display: flex; gap: 14px; align-items: center; flex-wrap: wrap;
          opacity: 0; transform: translateY(12px); animation: hwRise .7s 1.1s cubic-bezier(.16,1,.3,1) forwards;
        }
        .hw-ghost {
          color: #fff; font-weight: 500; font-size: 15px; padding: 13px 22px; border-radius: 12px;
          border: 1px solid rgba(255,255,255,.28); transition: background .25s, border-color .25s;
        }
        .hw-ghost:hover { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.5); }
        .hw-note { margin: 20px 0 0; font-size: 13px; color: #9a9aa2; opacity: 0; animation: hwFade 1s 1.4s forwards; }
        .hw-credit {
          position: absolute; right: clamp(16px, 4vw, 40px); bottom: 20px; z-index: 2;
          display: flex; align-items: center; gap: 12px; font-size: 11.5px; color: #a7a7ae;
          opacity: 0; animation: hwFade 1s 1.5s forwards;
        }
        .hw-cap { letter-spacing: .03em; }
        .hw-dots { display: flex; gap: 5px; }
        .hw-dots i { width: 16px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.28); transition: background .5s; }
        .hw-dots i.on { background: #E8B04B; }
        @keyframes hwRise { to { opacity: 1; transform: none; } }
        @keyframes hwFade { to { opacity: 1; } }
        @media (max-width: 600px) { .hw-credit .hw-cap { display: none; } }
        @media (prefers-reduced-motion: reduce) {
          .hw-layer { transition: none; }
          .hw-layer.on { animation: none; transform: scale(1.02); }
          .hw-kicker, .hw-word, .hw-lede, .hw-cta, .hw-note, .hw-credit { animation: none; opacity: 1; transform: none; }
        }
      `}</style>
    </section>
  );
}
