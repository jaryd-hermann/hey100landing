// Creates the waitlist tables. Run once after `vercel env pull`: npm run setup-db
import { db, SCHEMA } from '../lib/db.js';

try { process.loadEnvFile('.env.local'); } catch (_) { /* rely on the ambient environment */ }

const sql = db();
for (const statement of SCHEMA) await sql.query(statement);
const [{ n }] = await sql`SELECT count(*)::int AS n FROM waitlist`;
console.log(`waitlist tables ready (${n} signups so far)`);
