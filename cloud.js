/* Hero "problem cloud": a spotlight drifting over a near-invisible field of builder quotes. */
(() => {
  const OVERFLOW = 520;         // px the canvas extends below the hero, into the note's padding
  const RADIUS = 230;           // spotlight radius
  const SIZES = [11.5, 12.5, 13, 14];

  const QUOTES = [
    "my launch tweet got 4 likes, 3 were bots",
    "I have 11 users and I know all of them by name",
    "added Stripe before I added users",
    "asked ChatGPT how to get users. it said 'build in public'",
    "every launch platform is just other founders launching",
    "SEO will take 6 months. I have 2 months of runway",
    "I need people who'd actually use it, not just say nice things",
    "indie hackers forum: 200 views, 0 comments",
    "I DM'd 50 people. 4 replied. 1 signed up",
    "the app works. nobody knows it exists",
    "users sign up, poke around, never come back",
    "I can't tell if onboarding is broken or nobody cares",
    "tried TikTok. 300 views. my aunt commented",
    "how do I get feedback without paying for a usability study?",
    "my App Store page has 0 reviews",
    "I'm a developer, not a marketer",
    "launched on 8 directories. traffic: 12",
    "what's a good conversion rate for a waitlist?",
    "beta testers ghost after the first day",
    "no one tells you the hard part starts after you ship",
    "I just need 10 people to tell me what's confusing",
    "reddit flagged my post as self-promo",
    "free plan users don't reply to emails",
    "churn is 90% and I don't know why",
    "I've rewritten my landing page 6 times",
    "launched on Product Hunt, got 40 upvotes and 3 signups",
    "my mom is my only active user",
    "posted in 6 subreddits, got banned from 4",
    "spent 3 months building, 3 days marketing",
    "does anyone actually test apps anymore?",
    "I'll try yours if you try mine",
    "my waitlist is me and my cofounder",
    "built it in a weekend. still no users 6 months later",
    "how do you find your first 10 users?",
    "100 visitors, 0 signups. what am I doing wrong",
    "friends say it's great, then never open it",
    "TestFlight invite sent to 30 people, 2 installed",
    "I don't know who my app is for anymore",
    "cold DMs feel spammy but nothing else works",
    "the algorithm doesn't care about my launch tweet",
    "shipping is easy now. distribution is the whole game",
    "I just want honest feedback from someone who'd use it",
    "ads cost more than my MRR",
    "every growth guide says 'build in public'. I did. crickets",
    "got feedback once. it was 'looks cool'",
    "where do early adopters even hang out?",
    "my analytics dashboard is mostly zeros",
    "20 apps launched today in my category",
    "I'd pay for 10 real users who tell me the truth",
    "nobody reads my changelog",
    "is it the product or the marketing?",
    "week 1: 0 users. week 2: still 0",
    "I keep adding features instead of finding users",
    "Discord swap channels are just bots",
    "how did you get your first 100 users?",
  ];

  const wrap = document.querySelector('.hero-wrap');
  const canvas = wrap && wrap.querySelector('canvas.cloud');
  if (!wrap || !canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // Park–Miller LCG, re-seeded every layout pass so the field is identical on every load and resize.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  let W = 0, H = 0, heroHeight = 0;
  let items = [];
  const spot = { x: 0, y: 0, tx: 0, ty: 0, on: false };
  let started = false, visible = true, running = false, raf = 0;
  const t0 = performance.now();

  // Colour comes from the theme, so the cloud follows whatever --cloud-* the stylesheet sets.
  let INK = '232,236,231', BASE = 0.045;
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    INK = (cs.getPropertyValue('--cloud-ink') || INK).trim();
    BASE = parseFloat(cs.getPropertyValue('--cloud-base')) || BASE;
  }

  function layout() {
    readTheme();
    // Measure the wrapper, never the canvas: the canvas is sized from it, so reading it back gives 0.
    W = wrap.clientWidth;
    heroHeight = wrap.clientHeight;
    if (!W || !heroHeight) return false;
    H = heroHeight + OVERFLOW;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    seed = 7;
    const pool = QUOTES.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    items = [];
    let q = 0;
    for (let y = 20; y < H; y += 24 + Math.floor(rnd() * 14)) {
      for (let x = -Math.floor(rnd() * 320); x < W; ) {
        const size = SIZES[Math.floor(rnd() * SIZES.length)];
        const text = '“' + pool[q] + '”';
        if (++q >= pool.length) { q = 0; pool.push(pool.shift()); }  // rotate so wrap-arounds differ
        ctx.font = `400 ${size}px 'JetBrains Mono', monospace`;
        const w = ctx.measureText(text).width;
        items.push({ text, x, y: y + (rnd() - 0.5) * 6, w, size, v: 0.55 + rnd() * 0.9 });
        x += w + 36 + Math.floor(rnd() * 90);
      }
    }
    return true;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    const cw = Math.min(W * 0.5, 360);
    const narrow = W < 720;
    let font = '';
    for (const it of items) {
      const cx = clamp(spot.x, it.x, it.x + it.w);
      const d = Math.hypot(cx - spot.x, it.y - spot.y);
      const k = Math.max(0, 1 - d / RADIUS);
      // Suppress the centre column, but only over the hero copy — below it the field runs full strength.
      // Narrow viewports have no gutters (the copy fills the width), so the whole hero band stays down.
      const g = narrow ? 0 : clamp((Math.abs((it.x + it.w / 2) - W / 2) - cw * 0.55) / (cw * 0.6), 0, 1);
      const smooth = g * g * (3 - 2 * g);
      const mask = it.y > heroHeight ? 1 : 0.35 + 0.65 * smooth;
      const a = (BASE * it.v + k * k * 0.26) * mask;
      const f = `400 ${it.size}px 'JetBrains Mono', monospace`;
      if (f !== font) { ctx.font = f; font = f; }
      ctx.fillStyle = `rgba(${INK}, ${a})`;
      ctx.fillText(it.text, it.x, it.y);
    }
  }

  function frame() {
    raf = 0;
    if (!spot.on) {
      if (reduced.matches) { draw(); running = false; return; }  // static frame, no idle drift
      const t = (performance.now() - t0) / 1000;
      const side = Math.sin(t * 0.07) > 0 ? 0.84 : 0.16;         // alternate gutters, never the copy
      spot.tx = W * (side + 0.07 * Math.sin(t * 0.3));
      spot.ty = heroHeight * (0.42 + 0.3 * Math.sin(t * 0.21 + 1));
    }
    spot.x += (spot.tx - spot.x) * 0.12;
    spot.y += (spot.ty - spot.y) * 0.12;
    draw();
    if (running) raf = requestAnimationFrame(frame);
  }

  function run() {
    if (running || !started || !visible || !items.length) return;
    running = true;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function relayout() {
    if (!layout()) return;
    if (running) return;
    draw();                                     // keep a frame on screen while paused
  }

  // Pointer lives on window: the spotlight also works over the 520px that overflow the hero.
  addEventListener('pointermove', e => {
    if (!started) return;
    const r = canvas.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom) { spot.on = false; return; }
    spot.tx = e.clientX - r.left;
    spot.ty = e.clientY - r.top;
    if (!spot.on) { spot.x = spot.tx; spot.y = spot.ty; }   // snap on first activation
    spot.on = true;
    run();
  }, { passive: true });
  document.addEventListener('pointerleave', () => { spot.on = false; run(); });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    readTheme();
    if (!running) draw();
  });

  document.fonts.ready.then(() => {
    if (started) return;
    started = true;
    if (!layout()) return;

    new ResizeObserver(relayout).observe(wrap);
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) run(); else stop();
    }).observe(wrap);

    if (reduced.matches) draw();
    run();
  });
})();
