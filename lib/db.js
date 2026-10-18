import { neon } from '@neondatabase/serverless';

let sql = null;

/** Lazily build the Neon client so a missing env var fails at request time, not at import time. */
export function db() {
  if (!sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('Database is not configured (DATABASE_URL missing)');
    sql = neon(url);
  }
  return sql;
}

/** Each successful referral moves the referrer ahead of one day's worth of signups. */
export const REFERRAL_BOOST_MS = 24 * 60 * 60 * 1000;

/** Run once (npm run setup-db). Safe to re-run. */
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS waitlist (
     id          BIGSERIAL PRIMARY KEY,
     email       TEXT NOT NULL UNIQUE,
     code        TEXT NOT NULL UNIQUE,
     referred_by TEXT,
     referrals   INTEGER NOT NULL DEFAULT 0,
     score       BIGINT NOT NULL,
     joined_at   TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS waitlist_score_idx ON waitlist (score, id)`,
  `CREATE TABLE IF NOT EXISTS waitlist_rate (
     ip           TEXT PRIMARY KEY,
     hits         INTEGER NOT NULL,
     window_start TIMESTAMPTZ NOT NULL
   )`,
];

/** 1-based spot on the list: everyone with a lower (score, id) is ahead. */
export async function positionOf(sql, score, id) {
  const [row] = await sql`SELECT count(*)::int AS ahead FROM waitlist WHERE (score, id) < (${score}, ${id})`;
  return row.ahead + 1;
}

export async function countAll(sql) {
  const [row] = await sql`SELECT count(*)::int AS n FROM waitlist`;
  return row.n;
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
