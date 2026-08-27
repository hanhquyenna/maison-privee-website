/* ═══════════════════════════════════════════════════════════
   Maison Privée — cinematic scroll engine
   Native scroll + lerped progress → buttery scrubbing without
   hijacking the scrollbar. All animation on GPU transforms.
   ═══════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  /* ── preloader: warm the first chapter before unveiling ── */
  const preload = [
    'texture-ivory.jpg', 'texture-navy.jpg', 'wordmark.jpg',
    'aerial-township.jpg', 'aerial-day.jpg', 'aerial-dusk.jpg', 'towers-street.jpg',
    'entrance-gate.jpg'
  ].map(f => 'assets/img/' + f);

  const pctEl = document.getElementById('preloaderPct');
  const fillEl = document.getElementById('preloaderFill');
  let loaded = 0;
  const bump = () => {
    loaded++;
    const pct = Math.round(loaded / preload.length * 100);
    pctEl.textContent = pct + '%';
    fillEl.style.width = pct + '%';
    if (loaded >= preload.length) finish();
  };
  const finish = () => {
    setTimeout(() => {
      document.getElementById('preloader').classList.add('done');
      document.getElementById('nav').classList.add('show');
      document.querySelectorAll('#hero .reveal').forEach((el, i) =>
        setTimeout(() => el.classList.add('in'), 250 + i * 220));
    }, 350);
  };
  preload.forEach(src => {
    const im = new Image();
    im.onload = bump; im.onerror = bump;
    im.src = src;
  });
  setTimeout(finish, 7000); // safety net

  /* ── pinned frame sequences (the 3D zoom-through) ── */
  const sections = [];

  document.querySelectorAll('.pin-section').forEach(sec => {
    const frames = [...sec.querySelectorAll('.frame')];
    const captions = [...sec.querySelectorAll('.caption')];
    const vh = parseInt(sec.dataset.vh || 400, 10);
    sec.style.height = vh + 'vh';
    sections.push({
      el: sec, frames, captions,
      n: frames.length,
      pan: sec.classList.contains('pan-section'),
      zoomOnly: sec.classList.contains('zoom-only'),
      target: 0, current: 0
    });
  });

  /* horizontal gallery */
  const hSec = document.querySelector('.hscroll-section');
  const hTrack = document.getElementById('htrack');
  let hState = null;
  if (hSec && hTrack) {
    hSec.style.height = (parseInt(hSec.dataset.vh || 600, 10)) + 'vh';
    hState = { target: 0, current: 0 };
  }

  const measure = () => window.innerHeight;

  const progressOf = el => {
    const r = el.getBoundingClientRect();
    const total = r.height - measure();
    return total <= 0 ? 0 : clamp01(-r.top / total);
  };

  /* render one frame-sequence section at progress p (0..1) */
  const renderSeq = (s, p) => {
    const { frames, captions, n } = s;

    if (s.zoomOnly) {
      // single-image finale: long slow push-in
      const sc = lerp(1.28, 1.0, easeInOut(p));
      frames[0].style.opacity = 1;
      frames[0].querySelector('img').style.transform = `scale(${sc})`;
      const c = captions[0];
      const vis = clamp01((p - 0.25) / 0.3);
      c.style.opacity = vis;
      c.style.transform = `translateY(${lerp(30, 0, easeInOut(vis)) - 40}%)`;
      return;
    }

    const seg = 1 / n;              // each frame owns a progress band
    const FADE = 0.22;              // fraction of band used to crossfade

    frames.forEach((f, i) => {
      const start = i * seg, end = start + seg;
      const local = clamp01((p - start) / seg);
      let op = 0;

      if (p >= start && p < end) op = 1;
      // crossfade: next frame fades IN over the tail of previous band
      if (i > 0) {
        const fadeStart = start - seg * FADE;
        if (p >= fadeStart && p < start) op = (p - fadeStart) / (seg * FADE);
      }
      if (i === 0 && p < seg) op = 1;
      if (i === n - 1 && p >= end) op = 1;

      // camera: continuous push-in through each frame
      const img = f.querySelector('img');
      const zoom = lerp(1.0, 1.42, easeInOut(local));
      let tx = 0;
      if (s.pan) {
        // subtle lateral dolly, alternating — "seeing the room from angles"
        const dir = f.classList.contains('pan-right') ? 1 : -1;
        tx = lerp(-2.4, 2.4, local) * dir;
        img.style.transform = `scale(${1.16 + local * .22}) translateX(${tx}%)`;
      } else {
        img.style.transform = `scale(${zoom})`;
      }
      f.style.opacity = op;
      f.style.zIndex = i;
    });

    captions.forEach((c, i) => {
      const start = i * seg;
      const local = clamp01((p - start) / seg);
      // caption visible in the middle of its band
      const vis = local < .12 ? local / .12
                : local > .82 ? 1 - (local - .82) / .18
                : 1;
      c.style.opacity = clamp01(vis);
      c.style.transform = `translateY(${lerp(26, 0, clamp01(local / .12))}px)`;
    });
  };

  /* ── main loop ── */
  let navDark = false;
  const nav = document.getElementById('nav');

  /* debug: window.MPFREEZE = {id:'descent', p:0.5} pins a chapter at progress p */
  window.MPFREEZE = null;

  const tick = () => {
    sections.forEach(s => {
      if (window.MPFREEZE && s.el.id === window.MPFREEZE.id) {
        renderSeq(s, window.MPFREEZE.p);
        s.current = window.MPFREEZE.p;
        return;
      }
      s.target = progressOf(s.el);
      s.current = lerp(s.current, s.target, 0.085);
      if (Math.abs(s.current - s.target) < 0.0004) s.current = s.target;
      const r = s.el.getBoundingClientRect();
      if (r.bottom > -200 && r.top < measure() + 200) renderSeq(s, s.current);
    });

    if (hState) {
      hState.target = progressOf(hSec);
      hState.current = lerp(hState.current, hState.target, 0.085);
      const max = hTrack.scrollWidth - window.innerWidth;
      hTrack.style.transform = `translateX(${-max * hState.current}px)`;
      // per-card parallax
      hTrack.querySelectorAll('.hcard img').forEach((img, i) => {
        const rect = img.getBoundingClientRect();
        const center = (rect.left + rect.width / 2) / window.innerWidth - .5;
        img.style.transform = `scale(1.12) translateX(${center * -5}%)`;
      });
    }

    // nav style: solid after hero
    const past = window.scrollY > measure() * .85;
    nav.classList.toggle('solid', past);

    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  /* ── reveal-on-scroll ── */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.18 });
  document.querySelectorAll('.reveal').forEach(el => {
    if (!el.closest('#hero')) io.observe(el);
  });

  /* ── animated counters ── */
  const cio = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      cio.unobserve(e.target);
      const end = parseInt(e.target.dataset.count, 10);
      const t0 = performance.now(), dur = 1600;
      const step = now => {
        const k = clamp01((now - t0) / dur);
        e.target.textContent = Math.round(end * easeInOut(k));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-count]').forEach(el => cio.observe(el));

  /* ── side progress dots ── */
  const anchors = ['hero', 'descent', 'arrival', 'welcome', 'experiences', 'crest', 'residences', 'location', 'register'];
  const dotsWrap = document.getElementById('dots');
  anchors.forEach(id => {
    const a = document.createElement('a');
    a.href = '#' + id;
    dotsWrap.appendChild(a);
  });
  const dotEls = [...dotsWrap.children];
  const dio = () => {
    let active = 0;
    anchors.forEach((id, i) => {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= measure() * .5) active = i;
    });
    dotEls.forEach((d, i) => d.classList.toggle('active', i === active));
  };
  window.addEventListener('scroll', dio, { passive: true });
  dio();

  /* lazy-decode the rest once idle */
  window.addEventListener('load', () => {
    document.querySelectorAll('img[src]').forEach(img => { img.decoding = 'async'; });
  });
})();
