/* Hey100 waitlist front-end. Talks to /api/waitlist. */
(() => {
  const API = '/api/waitlist';
  const SITE = 'hey100.com';
  const MIN_PUBLIC_COUNT = 10;      // hide "N builders on the waitlist" until the list is this long
  const STORE_KEY = 'hey100:joined';
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = { joined: null, count: null, shownCount: 0 };

  // Referral code from hey100.com/w/<code> (rewritten to / by vercel.json) or ?ref=<code>
  function readRef() {
    const m = location.pathname.match(/^\/w\/([A-Za-z0-9]{1,32})\/?$/);
    if (m) return m[1].toLowerCase();
    const q = new URLSearchParams(location.search).get('ref') || '';
    return q.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
  }
  const REF = readRef();

  function loadJoined() {
    try {
      const j = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (j && j.email && j.code && j.position) state.joined = j;
    } catch (_) { /* storage unavailable */ }
  }
  function saveJoined() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.joined)); } catch (_) { /* ignore */ }
  }

  function render() {
    const joined = !!state.joined;
    $$('[data-when="not-joined"]').forEach(el => { el.hidden = joined; });
    $$('[data-when="joined"]').forEach(el => { el.hidden = !joined; });
    if (joined) {
      $$('[data-position]').forEach(el => { el.textContent = state.joined.position.toLocaleString(); });
      $$('[data-email]').forEach(el => { el.textContent = state.joined.email; });
      $$('[data-reflink]').forEach(el => { el.textContent = `${SITE}/w/${state.joined.code}`; });
    }
    const show = state.count !== null && state.count >= MIN_PUBLIC_COUNT;
    $$('[data-count-row]').forEach(el => { el.hidden = !show; });
  }

  let raf = 0;
  function animateCount(target) {
    cancelAnimationFrame(raf);
    const from = state.shownCount;
    const start = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - start) / 1400);
      const v = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      state.shownCount = v;
      $$('[data-count]').forEach(el => { el.textContent = v.toLocaleString(); });
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function setCount(n) {
    state.count = n;
    render();
    animateCount(n);
  }

  async function refresh() {
    try {
      const url = state.joined ? `${API}?code=${encodeURIComponent(state.joined.code)}` : API;
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      const d = await r.json();
      if (typeof d.count === 'number') setCount(d.count);
      if (state.joined && typeof d.position === 'number' && d.position > 0) {
        state.joined.position = d.position;
        saveJoined();
        render();
      }
    } catch (_) { /* offline or API down: page still renders */ }
  }

  function showError(form, msg) {
    const el = form.parentElement.querySelector('[data-error]');
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  async function join(form) {
    const input = form.querySelector('input[type="email"]');
    const button = form.querySelector('button[type="submit"]');
    const label = button.querySelector('[data-label]');
    const email = input.value.trim();
    if (!EMAIL_RE.test(email)) {
      showError(form, 'Enter a valid email address.');
      input.focus();
      return;
    }
    showError(form, '');
    const original = label.textContent;
    button.disabled = true;
    label.textContent = 'Joining…';
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, ref: REF, website: form.querySelector('input[name="website"]').value }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
      state.joined = { email, code: d.code, position: d.position };
      saveJoined();
      render();
      if (typeof d.count === 'number') setCount(d.count);
    } catch (e) {
      showError(form, e.message || 'Something went wrong. Please try again.');
    } finally {
      button.disabled = false;
      label.textContent = original;
    }
  }

  function copyRef(btn) {
    if (!state.joined) return;
    const url = `https://${SITE}/w/${state.joined.code}`;
    const done = () => {
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2500);
    };
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (_) { /* ignore */ }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else {
      fallback();
    }
  }

  // Founder video: the embed runs with controls=0, so the native centre button starts it
  // and this transparent layer toggles play/pause through TikTok's postMessage API.
  (function videoToggle() {
    const frame = document.getElementById('founder-video');
    const tap = document.querySelector('[data-video-toggle]');
    if (!frame || !tap) return;
    let playing = false;
    const post = type => { try { frame.contentWindow.postMessage({ 'x-tiktok-player': true, type }, '*'); } catch (_) { /* ignore */ } };
    const show = state => {
      playing = state === 1 || state === 3;              // 1 playing, 3 buffering
      tap.hidden = state === -1;                         // untouched: let the native play button handle the first tap
      tap.dataset.state = playing ? 'playing' : 'paused';
      tap.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    };
    window.addEventListener('message', e => {
      if (e.origin !== 'https://www.tiktok.com' || !e.data || e.data['x-tiktok-player'] !== true) return;
      if (e.data.type === 'onStateChange') show(Number(e.data.value));
    });
    tap.addEventListener('click', () => post(playing ? 'pause' : 'play'));
  })();

  // Scroll reveal: each line brightens as it climbs the viewport, so the problem
  // unfolds a beat at a time. Lines stay fully lit in CSS until this takes over.
  (function scrollReveal() {
    const sec = document.querySelector('.reveal');
    if (!sec) return;
    const lines = Array.from(sec.querySelectorAll('.line'));
    if (!lines.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    sec.classList.add('on');
    let pending = false;
    const update = () => {
      pending = false;
      const vh = innerHeight;
      for (const el of lines) {
        const r = el.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        // fully lit by the time the line's middle reaches 55% of the viewport height
        const p = Math.min(1, Math.max(0, (vh * 0.88 - mid) / (vh * 0.33)));
        el.style.setProperty('--lit', p.toFixed(3));
      }
    };
    const onScroll = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    update();
  })();

  loadJoined();
  render();
  $$('form[data-join]').forEach(f => f.addEventListener('submit', e => { e.preventDefault(); join(f); }));
  $$('[data-copy]').forEach(b => b.addEventListener('click', () => copyRef(b)));
  // The two email inputs (hero + founder note) share one value, like the original design.
  const inputs = $$('form[data-join] input[type="email"]');
  inputs.forEach(i => i.addEventListener('input', () => inputs.forEach(o => { if (o !== i) o.value = i.value; })));
  refresh();
})();
