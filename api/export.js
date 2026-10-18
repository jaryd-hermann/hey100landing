import { timingSafeEqual } from 'node:crypto';
import { db, send } from '../lib/db.js';

/**
 * GET /api/export              -> CSV of the whole waitlist, in position order
 * GET /api/export?format=json  -> same as JSON
 * Auth: `Authorization: Bearer <ADMIN_KEY>` header or `?key=<ADMIN_KEY>`.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return send(res, 405, { error: 'Method not allowed' });
    }
    const expected = process.env.ADMIN_KEY || '';
    const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String((req.query && req.query.key) || '');
    if (!expected || !safeEqual(given, expected)) return send(res, 401, { error: 'Unauthorized' });

    const sql = db();
    const rows = await sql`SELECT email, code, referred_by, referrals, joined_at FROM waitlist ORDER BY score, id`;
    const out = rows.map((r, i) => ({
      position: i + 1,
      email: r.email,
      code: r.code,
      joinedAt: new Date(r.joined_at).toISOString(),
      referredBy: r.referred_by || '',
      referrals: Number(r.referrals || 0),
    }));

    res.setHeader('Cache-Control', 'no-store');
    if ((req.query && req.query.format) === 'json') return send(res, 200, { count: out.length, rows: out });

    const header = ['position', 'email', 'code', 'joinedAt', 'referredBy', 'referrals'];
    const csv = [header.join(','), ...out.map(row => header.map(k => csvCell(row[k])).join(','))].join('\r\n') + '\r\n';
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="hey100-waitlist.csv"');
    res.end(csv);
  } catch (err) {
    console.error('export error', err);
    return send(res, 500, { error: 'Export failed' });
  }
}

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function safeEqual(a, b) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
