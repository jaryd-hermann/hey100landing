import { randomBytes } from 'node:crypto';
import { db, REFERRAL_BOOST_MS, positionOf, countAll, send } from '../lib/db.js';
import { notifySignup } from '../lib/notify.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RATE_LIMIT_PER_MINUTE = 10;

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return await getStatus(req, res);
    if (req.method === 'POST') return await join(req, res);
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('waitlist error', err);
    return send(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}

/** GET /api/waitlist[?code=xyz] -> { count, position? } */
async function getStatus(req, res) {
  const sql = db();
  const code = cleanCode(req.query && req.query.code);
  const body = { count: await countAll(sql) };
  if (code) {
    const [row] = await sql`SELECT id, score FROM waitlist WHERE code = ${code}`;
    if (row) body.position = await positionOf(sql, row.score, row.id);
  }
  return send(res, 200, body);
}

/** POST /api/waitlist { email, ref?, website? } -> { ok, position, code, count, existing? } */
async function join(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Honeypot: real users never fill this hidden field.
  if (body.website) return send(res, 400, { error: 'Invalid submission.' });

  const email = String(body.email || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return send(res, 400, { error: 'Enter a valid email address.' });

  const sql = db();

  // Simple per-IP limit: N signups per rolling minute.
  const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0] || '').trim() || 'unknown';
  const [{ hits }] = await sql`
    INSERT INTO waitlist_rate (ip, hits, window_start) VALUES (${ip}, 1, now())
    ON CONFLICT (ip) DO UPDATE SET
      hits = CASE WHEN waitlist_rate.window_start < now() - interval '1 minute' THEN 1 ELSE waitlist_rate.hits + 1 END,
      window_start = CASE WHEN waitlist_rate.window_start < now() - interval '1 minute' THEN now() ELSE waitlist_rate.window_start END
    RETURNING hits`;
  if (hits > RATE_LIMIT_PER_MINUTE) return send(res, 429, { error: 'Too many attempts. Try again in a minute.' });

  // Already on the list: hand back their existing spot instead of creating a duplicate.
  const [existing] = await sql`SELECT id, code, score FROM waitlist WHERE email = ${email}`;
  if (existing) {
    return send(res, 200, {
      ok: true, existing: true, code: existing.code,
      position: await positionOf(sql, existing.score, existing.id),
      count: await countAll(sql),
    });
  }

  // Referrer, from hey100.com/w/<code>. Never yourself.
  let referrer = null;
  const ref = cleanCode(body.ref);
  if (ref) {
    const [row] = await sql`SELECT id, email FROM waitlist WHERE code = ${ref}`;
    if (row && row.email !== email) referrer = row;
  }

  // Insert, retrying on referral-code collisions.
  const joinedAt = Date.now();
  const base = (email.split('@')[0] || '').replace(/[^a-z0-9]/g, '').slice(0, 14) || 'you';
  let row = null;
  for (let attempt = 0; attempt < 6 && !row; attempt++) {
    const code = attempt === 0 ? base : attempt < 5 ? base.slice(0, 10) + random(4) : random(10);
    try {
      const rows = await sql`
        INSERT INTO waitlist (email, code, referred_by, score)
        VALUES (${email}, ${code}, ${referrer ? ref : null}, ${joinedAt})
        ON CONFLICT (email) DO NOTHING
        RETURNING id, code, score`;
      if (rows.length) {
        row = rows[0];
      } else {
        // Lost a race with a duplicate submit of the same email; reuse that row.
        [row] = await sql`SELECT id, code, score FROM waitlist WHERE email = ${email}`;
        referrer = null;
      }
    } catch (err) {
      if (err && err.code === '23505') continue; // code already taken, try another
      throw err;
    }
  }
  if (!row) return send(res, 500, { error: 'Could not create your spot. Please try again.' });

  if (referrer) {
    await sql`UPDATE waitlist SET referrals = referrals + 1, score = score - ${REFERRAL_BOOST_MS} WHERE id = ${referrer.id}`;
  }

  const position = await positionOf(sql, row.score, row.id);
  const count = await countAll(sql);

  // Owner ping. Never throws, so a mail outage cannot cost us the signup we just stored.
  await notifySignup({ id: row.id, email, position, count, code: row.code, referredBy: referrer ? ref : null });

  return send(res, 200, { ok: true, code: row.code, position, count });
}

function random(n) {
  return randomBytes(n * 2).toString('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, n) || 'x'.repeat(n);
}

function cleanCode(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
}
