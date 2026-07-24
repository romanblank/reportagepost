// Мини-брендбук «Репортаж Пост» → HTML для артефакта (base64-встройка ассетов).
import { readFileSync, writeFileSync } from 'node:fs';
const b = (f) => 'data:image/png;base64,' + readFileSync(`public/brand/final/${f}.png`).toString('base64');
const img = {
  iconDark: b('icon-512'),
  markCream: b('_preview-mark-cream'),
  wordmark: b('_preview-wordmark'),
  lockDark: b('_preview-lockup-dark'),
  lockLight: b('_preview-lockup-light'),
  header: b('_preview-header'),
  fav48: b('favicon-48'),
  fav32: b('favicon-32'),
  apple: b('apple-touch-icon'),
  maskable: b('icon-maskable-512'),
};

const sw = (name, hex, note, dark) => `<div class="sw"><div class="chip" style="background:${hex};${dark ? 'border:1px solid var(--line)' : ''}"></div><div class="swm"><b>${name}</b><code>${hex}</code><span>${note}</span></div></div>`;

const html = `<title>Репортаж Пост — мини-брендбук</title>
<style>
  :root{ --bg:#f4f2ee; --panel:#fffdfa; --ink:#17181c; --muted:#6f6f77; --line:#e6e2d9; --gold:#b7791f; --goldhi:#e8b04b; --red:#e5484d; --shot:#111217; }
  @media (prefers-color-scheme: dark){ :root{ --bg:#0e0f12; --panel:#16171b; --ink:#f4f1ea; --muted:#9a9aa2; --line:#26262c; --gold:#e8b04b; --goldhi:#f0c46e; --red:#f2565b; --shot:#0a0a0d; } }
  :root[data-theme="light"]{ --bg:#f4f2ee; --panel:#fffdfa; --ink:#17181c; --muted:#6f6f77; --line:#e6e2d9; --gold:#b7791f; --goldhi:#e8b04b; --red:#e5484d; --shot:#111217; }
  :root[data-theme="dark"]{ --bg:#0e0f12; --panel:#16171b; --ink:#f4f1ea; --muted:#9a9aa2; --line:#26262c; --gold:#e8b04b; --goldhi:#f0c46e; --red:#f2565b; --shot:#0a0a0d; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif; line-height:1.6; }
  .wrap{ max-width:1000px; margin:0 auto; padding:60px 24px 100px; }
  .eyebrow{ font-size:12px; letter-spacing:.26em; text-transform:uppercase; color:var(--gold); font-weight:700; margin:0 0 16px; }
  h1{ font-family:Georgia,serif; font-weight:600; font-size:clamp(32px,5.5vw,54px); line-height:1.04; letter-spacing:-.015em; margin:0 0 16px; text-wrap:balance; }
  .lead{ color:var(--muted); max-width:66ch; font-size:16.5px; margin:0 0 8px; }
  .lead b{ color:var(--ink); }
  section{ margin:64px 0 0; }
  h2{ font-family:Georgia,serif; font-weight:600; font-size:15px; letter-spacing:.02em; margin:0 0 4px; text-transform:none; }
  .knum{ color:var(--gold); font-weight:700; }
  .sub{ color:var(--muted); font-size:14px; margin:0 0 22px; }
  .hr{ height:1px; background:var(--line); border:0; margin:14px 0 0; }
  .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:20px; }
  @media (max-width:640px){ .grid2{ grid-template-columns:1fr; } }
  .card{ background:var(--panel); border:1px solid var(--line); border-radius:20px; overflow:hidden; }
  .stage{ display:grid; place-items:center; padding:40px; }
  .stage.dark{ background:var(--shot); } .stage.cream{ background:#f1eee7; } .stage.light{ background:#f4f2ee; }
  .stage img.mark{ width:170px; height:170px; border-radius:34px; }
  .stage img.wide{ width:100%; max-width:520px; height:auto; }
  .cap{ padding:14px 18px 18px; color:var(--muted); font-size:13px; border-top:1px solid var(--line); }
  .cap b{ color:var(--ink); }
  .swatches{ display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:14px; }
  .sw{ display:flex; align-items:center; gap:14px; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:12px 14px; }
  .chip{ width:44px; height:44px; border-radius:10px; flex:none; }
  .swm{ display:flex; flex-direction:column; line-height:1.35; }
  .swm b{ font-size:13.5px; } .swm code{ font-size:12px; color:var(--muted); font-family:ui-monospace,monospace; } .swm span{ font-size:11.5px; color:var(--muted); }
  .type{ display:grid; gap:14px; }
  .trow{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px 18px; display:flex; justify-content:space-between; align-items:baseline; gap:16px; flex-wrap:wrap; }
  .trow .big{ font-size:26px; } .trow .meta{ color:var(--muted); font-size:13px; }
  .rules{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width:640px){ .rules{ grid-template-columns:1fr; } }
  .do,.dont{ border-radius:14px; padding:16px 18px; font-size:14px; border:1px solid var(--line); background:var(--panel); }
  .do h4,.dont h4{ margin:0 0 8px; font-size:13px; letter-spacing:.04em; text-transform:uppercase; }
  .do h4{ color:#2e7d55; } .dont h4{ color:var(--red); }
  .do ul,.dont ul{ margin:0; padding-left:18px; color:var(--muted); } .do li,.dont li{ margin:4px 0; }
  .icons{ display:flex; gap:18px; align-items:flex-end; flex-wrap:wrap; }
  .icons figure{ margin:0; text-align:center; }
  .icons img{ border-radius:22%; display:block; }
  .icons figcaption{ color:var(--muted); font-size:12px; margin-top:8px; }
  .files{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px 18px; font-size:13px; color:var(--muted); font-family:ui-monospace,monospace; overflow-x:auto; }
  .files b{ color:var(--ink); font-family:ui-sans-serif; }
</style>
<div class="wrap">
  <p class="eyebrow">Бренд-система · v1.0 · 2026</p>
  <h1>Репортаж&nbsp;Пост — мини-брендбук</h1>
  <p class="lead"><b>Идея знака:</b> разрежённые точки — люди, события, кадры — сходятся к одной <b>золотой точке решающего момента</b>. Золото = «признание», ради которого существует платформа. <b>Идея вордмарка:</b> узкая журнальная антиква-гротеск (DIN Condensed), два слова собраны в один блок равной ширины — характер пресс-карты и фотожурнала, а не биржи услуг.</p>

  <section>
    <h2><span class="knum">01</span> — Знак</h2>
    <p class="sub">Основной символ. Живёт на тёмном (ink) и на кремовом. Золотое ядро — единственный акцент.</p>
    <div class="grid2">
      <div class="card"><div class="stage dark"><img class="mark" src="${img.iconDark}" alt="Знак на ink"></div><div class="cap"><b>На ink</b> — приложение, аватар, каталог, фавикон.</div></div>
      <div class="card"><div class="stage cream"><img class="mark" src="${img.markCream}" alt="Знак на кремовом"></div><div class="cap"><b>На кремовом</b> — светлые макеты, печать, документы.</div></div>
    </div>
  </section>

  <section>
    <h2><span class="knum">02</span> — Вордмарк</h2>
    <p class="sub">DIN Condensed, глифы переведены в кривые (не зависит от шрифта на устройстве). «РЕПОРТАЖ» и «ПОСТ» — одной ширины (юстировка). «ПОСТ» — золотом.</p>
    <div class="card"><div class="stage light"><img class="wide" src="${img.wordmark}" alt="Вордмарк"></div><div class="cap"><b>Юстированный блок.</b> Базовое написание названия.</div></div>
  </section>

  <section>
    <h2><span class="knum">03</span> — Лока́п</h2>
    <p class="sub">Знак + вордмарк + кикер. Для шапки, писем, соцсетей, обложек.</p>
    <div class="grid2">
      <div class="card"><div class="stage dark"><img class="wide" src="${img.lockDark}" alt="Лока́п тёмный"></div><div class="cap"><b>Тёмный</b> — основной.</div></div>
      <div class="card"><div class="stage light"><img class="wide" src="${img.lockLight}" alt="Лока́п светлый"></div><div class="cap"><b>Светлый</b>.</div></div>
    </div>
    <div class="card" style="margin-top:20px"><div class="stage light"><img class="wide" src="${img.header}" alt="Шапка сайта" style="max-width:420px"></div><div class="cap"><b>Компактный лока́п шапки</b> — уже стоит в хедере сайта (ink = цвет текста, «ПОСТ» = <code>--recognition</code>, тема-адаптивно).</div></div>
  </section>

  <section>
    <h2><span class="knum">04</span> — Цвета</h2>
    <p class="sub">Ink + кремовый — основа. Золото «признания» — единственный бренд-акцент знака. Красный — UI-акцент кнопок (не в лого).</p>
    <div class="swatches">
      ${sw('Ink', '#17181c', 'фон, текст', true)}
      ${sw('Кремовый', '#f4f1ea', 'светлый фон, выворотка')}
      ${sw('Золото признания', '#b7791f', 'акцент знака, «ПОСТ»')}
      ${sw('Золото (hi)', '#e8b04b', 'ядро, тёмная тема')}
      ${sw('Пресс-красный', '#e5484d', 'UI-акцент, кнопки')}
    </div>
  </section>

  <section>
    <h2><span class="knum">05</span> — Типографика</h2>
    <p class="sub">Логотип — DIN Condensed. Продукт — Inter (UI/текст) + Cormorant (журнальные заголовки). Все с кириллицей.</p>
    <div class="type">
      <div class="trow"><span class="big" style="font-family:'Arial Narrow',sans-serif;font-weight:700;letter-spacing:.02em;text-transform:uppercase">Репортаж Пост</span><span class="meta">DIN Condensed Bold — только логотип</span></div>
      <div class="trow"><span class="big" style="font-family:Georgia,serif">Заголовок журнала</span><span class="meta">Cormorant — дисплей-заголовки</span></div>
      <div class="trow"><span class="big" style="font-family:ui-sans-serif">Интерфейс и текст</span><span class="meta">Inter — UI, body</span></div>
    </div>
  </section>

  <section>
    <h2><span class="knum">06</span> — Иконки и фавикон</h2>
    <p class="sub">Из знака на тёмной плитке. Для 16–32px — упрощённая версия (меньше точек, крупнее ядро).</p>
    <div class="icons">
      <figure><img src="${img.fav32}" width="32" height="32" alt="32"><figcaption>favicon 32</figcaption></figure>
      <figure><img src="${img.fav48}" width="48" height="48" alt="48"><figcaption>favicon 48</figcaption></figure>
      <figure><img src="${img.apple}" width="76" height="76" alt="apple"><figcaption>apple-touch 180</figcaption></figure>
      <figure><img src="${img.maskable}" width="96" height="96" alt="maskable" style="border-radius:22%"><figcaption>maskable 512</figcaption></figure>
    </div>
  </section>

  <section>
    <h2><span class="knum">07</span> — Правила</h2>
    <div class="rules">
      <div class="do"><h4>✓ Можно</h4><ul><li>Свободное поле вокруг ≥ высоте буквы «П».</li><li>Мин. высота знака — 24px (экран), 8мм (печать).</li><li>Золото — только на ядре знака и слове «ПОСТ».</li><li>На фото — только выворотка (кремовый) на затемнении.</li></ul></div>
      <div class="dont"><h4>✕ Нельзя</h4><ul><li>Менять гарнитуру вордмарка или набирать его вручную.</li><li>Красить знак в красный/произвольные цвета.</li><li>Растягивать, наклонять, добавлять тени/обводки.</li><li>Дробить блок «РЕПОРТАЖ/ПОСТ» на разную ширину.</li></ul></div>
    </div>
  </section>

  <section>
    <h2><span class="knum">08</span> — Файлы</h2>
    <div class="files">
      <b>Векторы</b> — public/brand/final/*.svg (mark-tile, wordmark, lockup-dark/light, header-lockup, *-mono)<br>
      <b>Растр</b> — favicon-16/32/48, apple-touch-icon, icon-192/512, icon-maskable-512<br>
      <b>В продукте</b> — src/components/BrandLockup.tsx (шапка) · src/app/favicon.ico · public/icons/*<br>
      <b>Генератор</b> — node scripts/brand-final.mjs (пересборка всего пакета)
    </div>
  </section>
</div>`;
writeFileSync('scripts/.brandbook.html', html);
console.log('written', (html.length / 1024 | 0), 'KB');
