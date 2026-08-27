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
    'img/texture-ivory.jpg', 'img/texture-navy.jpg', 'img/wordmark.jpg',
    'img/aerial-dusk.jpg', 'img/entrance-gate.jpg',
    'seq/d0000.jpg', 'seq/d0036.jpg', 'seq/d0072.jpg', 'seq/d0108.jpg', 'seq/d0144.jpg', 'seq/d0179.jpg'
  ].map(f => 'assets/' + f);

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
    const s = {
      el: sec, frames, captions,
      n: frames.length,
      pan: sec.classList.contains('pan-section'),
      zoomOnly: sec.classList.contains('zoom-only'),
      target: 0, current: 0
    };
    /* video-scrub mode: data-seq="assets/seq/d" data-seq-count="180" */
    if (sec.dataset.seq) {
      s.canvas = sec.querySelector('.seq-canvas');
      s.ctx = s.canvas.getContext('2d');
      s.seqN = parseInt(sec.dataset.seqCount, 10);
      s.imgs = new Array(s.seqN).fill(null);
      s.lastDrawn = -1;
      const pad = i => String(i).padStart(4, '0');
      const load = i => {
        if (s.imgs[i]) return;
        const im = new Image();
        im.onload = () => { s.imgs[i] = im; if (nearestLoaded(s, Math.round(s.current * (s.seqN - 1))) === i) s.lastDrawn = -1; };
        im.src = `${sec.dataset.seq}${pad(i)}.jpg`;
        s.imgs[i] = im.complete ? im : s.imgs[i]; // cache hit
      };
      // progressive: coarse pass (every 6th) first, fine pass on idle
      for (let i = 0; i < s.seqN; i += 6) load(i);
      const fine = () => { for (let i = 0; i < s.seqN; i++) load(i); };
      ('requestIdleCallback' in window) ? requestIdleCallback(fine, { timeout: 4000 }) : setTimeout(fine, 2500);
    }
    sections.push(s);
  });

  const nearestLoaded = (s, idx) => {
    for (let d = 0; d < s.seqN; d++) {
      const lo = idx - d, hi = idx + d;
      if (lo >= 0 && s.imgs[lo] && s.imgs[lo].complete && s.imgs[lo].naturalWidth) return lo;
      if (hi < s.seqN && s.imgs[hi] && s.imgs[hi].complete && s.imgs[hi].naturalWidth) return hi;
    }
    return -1;
  };

  const drawSeq = (s, p) => {
    const cv = s.canvas, ctx = s.ctx;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cv.clientWidth * dpr, h = cv.clientHeight * dpr;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; s.lastDrawn = -1; }
    const idx = nearestLoaded(s, Math.round(p * (s.seqN - 1)));
    if (idx < 0 || idx === s.lastDrawn) return;
    const im = s.imgs[idx];
    // cover-fit
    const ir = im.naturalWidth / im.naturalHeight, cr = w / h;
    let dw, dh;
    if (ir > cr) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
    ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
    s.lastDrawn = idx;
  };

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

    if (s.canvas) {
      drawSeq(s, p);
      // captions in equal bands across the scrub
      const cn = captions.length, cseg = 1 / cn;
      captions.forEach((c, i) => {
        const local = clamp01((p - i * cseg) / cseg);
        const vis = local < .12 ? local / .12
                  : local > .82 ? 1 - (local - .82) / .18
                  : 1;
        c.style.opacity = clamp01(vis);
        c.style.transform = `translateY(${lerp(26, 0, clamp01(local / .12))}px)`;
      });
      return;
    }

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
