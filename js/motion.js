'use strict';

/*
  Движение по наведению мыши:
  - карточки (услуги, проект, команда, факты, панели, фото) наклоняются за курсором, по ним бежит блик;
  - кнопки, метки и пункты меню «притягиваются» к курсору;
  - элементы сцены (голограмма, мониторы, чип, сервер, робот, плата) и плашки смещаются вслед за мышью (параллакс).
  Значения передаются в CSS через переменные (--rx/--ry, --mx/--my, --tx/--ty, --px/--py).
  На сенсорных экранах и при включённом «уменьшении движения» скрипт ничего не делает.
*/
(() => {
  const TILT_SELECTOR = '.scene-piece, .service, .feature, .member, .fact, .panel, .gallery figure, .hero-visual, .cta-band, .list';
  const MAGNET_SELECTOR = '.btn, .chip, .tag, .site-nav a, .lang-switch button, .nav-toggle, .brand, .stat, .fab';
  const MAX_TILT_DEG = 6;
  const WIDE_TILT_DEG = 1.5; // широкие блоки (списки, баннер) наклоняются едва заметно
  const MAGNET_PX = 8;

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!finePointer.matches || reducedMotion.matches) return;

  let tiltEl = null;
  let magnetEl = null;
  let lastEvent = null;
  let frame = 0;
  // Параллакс общий для страницы: элементы сцены читают --px/--py с корня.
  const root = document.documentElement;

  const clearProps = (el, props) => props.forEach((p) => el.style.removeProperty(p));

  function releaseTilt() {
    if (!tiltEl) return;
    tiltEl.classList.remove('is-hover');
    clearProps(tiltEl, ['--rx', '--ry']);
    tiltEl = null;
  }

  function releaseMagnet() {
    if (!magnetEl) return;
    clearProps(magnetEl, ['--tx', '--ty']);
    magnetEl = null;
  }

  function updateTilt(event) {
    const target = event.target.closest(TILT_SELECTOR);
    if (target !== tiltEl) {
      releaseTilt();
      tiltEl = target;
      if (tiltEl) tiltEl.classList.add('is-hover');
    }
    if (!tiltEl) return;

    const rect = tiltEl.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const max = tiltEl.matches('.list, .cta-band') ? WIDE_TILT_DEG : MAX_TILT_DEG;
    tiltEl.style.setProperty('--ry', `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
    tiltEl.style.setProperty('--rx', `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
    tiltEl.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    tiltEl.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  }

  function updateMagnet(event) {
    const target = event.target.closest(MAGNET_SELECTOR);
    if (target !== magnetEl) {
      releaseMagnet();
      magnetEl = target;
    }
    if (!magnetEl) return;

    const rect = magnetEl.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    magnetEl.style.setProperty('--tx', `${(dx * MAGNET_PX).toFixed(1)}px`);
    magnetEl.style.setProperty('--ty', `${(dy * MAGNET_PX * 0.6 - 2).toFixed(1)}px`);
  }

  function updateParallax(event) {
    const px = (event.clientX / window.innerWidth - 0.5) * 2;
    const py = (event.clientY / window.innerHeight - 0.5) * 2;
    root.style.setProperty('--px', px.toFixed(3));
    root.style.setProperty('--py', py.toFixed(3));
  }

  function onFrame() {
    frame = 0;
    if (!lastEvent || !(lastEvent.target instanceof Element)) return;
    updateTilt(lastEvent);
    updateMagnet(lastEvent);
    updateParallax(lastEvent);
  }

  document.addEventListener(
    'pointermove',
    (event) => {
      lastEvent = event;
      if (!frame) frame = requestAnimationFrame(onFrame);
    },
    { passive: true },
  );

  document.documentElement.addEventListener('pointerleave', () => {
    releaseTilt();
    releaseMagnet();
  });
})();
