# Hey100 landing page + waitlist

Static landing page for **hey100.com** with a small waitlist backend.

- Hosting: Vercel project `hey100` (team Jaryd)
- Storage: Neon Postgres (`hey100-db`, provisioned through the Vercel Marketplace)
- No framework, no build step: plain HTML/CSS/JS + two Vercel Functions

## Files

| Path | What it is |
|------|------------|
| `index.html`, `styles.css`, `main.js` | The page. `main.js` talks to the API, remembers a signup in `localStorage`, and animates the counter. |
| `api/waitlist.js` | `GET` → `{ count, position? }` · `POST { email, ref? }` → `{ ok, position, code, count }` |
| `api/export.js` | `GET /api/export` → CSV of the list (needs `ADMIN_KEY`). Add `?format=json` for JSON. |
| `lib/db.js` | Neon client, schema, position/count helpers |
| `scripts/setup-db.js` | Creates the tables. Idempotent. |
| `vercel.json` | Clean URLs, `/w/:code` → `/` rewrite for referral links, security headers |

## How the waitlist works

- Emails are lower-cased and de-duplicated. Re-submitting returns the existing spot.
- Every signup gets a referral code (the email's local part, e.g. `hey100.com/w/jaryd`; random suffix on collisions).
- A signup that arrives through `/w/<code>` credits that referrer and moves them ahead by one day's worth of signups
  (`REFERRAL_BOOST_MS` in `lib/db.js`).
- Position = number of people with an earlier (score, id) + 1.
- Spam guards: hidden honeypot field, 10 signups per IP per minute.
- The "N builders on the waitlist" row stays hidden until the list reaches `MIN_PUBLIC_COUNT` (10) in `main.js`.

## Founder video

The TikTok embed runs with `controls=0` so only the centre play button shows. TikTok's player ignores
the per-button hide flags, so `main.js` adds a transparent tap layer over the video once playback starts:
tap to pause, tap again to resume, driven by TikTok's postMessage API (`x-tiktok-player` messages).
The header, caption and like/comment/share icons are part of the embed and cannot be removed.

## Export the list

```bash
curl -H "Authorization: Bearer $ADMIN_KEY" https://hey100.com/api/export -o hey100-waitlist.csv
```

`ADMIN_KEY` lives in the Vercel project env (all environments) and in `.env.local`.

## Local development

```bash
vercel env pull .env.local   # DATABASE_URL, ADMIN_KEY, …
npm run setup-db             # once, creates the tables
vercel dev --listen 3100
```

## Deploy

```bash
vercel --prod
```

## Domain

`hey100.com` is attached to the project. DNS must point at Vercel before it resolves:
either an `A` record `hey100.com → 76.76.21.21` at the current DNS host, or switch the
nameservers to `ns1.vercel-dns.com` / `ns2.vercel-dns.com`. Check with `vercel domains verify hey100.com`.
