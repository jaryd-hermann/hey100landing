/** Signup pings to the owner. A mail failure must never break a signup, so everything here fails soft. */

const ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 5000;

/** Sandbox sender: only delivers to the address that owns the Resend account. */
const SANDBOX_FROM = 'Hey100 <onboarding@resend.dev>';

/**
 * Email the owner that someone joined. Resolves quietly when unconfigured or when Resend is down.
 * Set NOTIFY_FROM to an address on a verified Resend domain to send as Hey100 proper.
 */
export async function notifySignup({ id, email, position, count, code, referredBy }) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_TO;
  if (!key || !to) return;

  const lines = [
    `Email: ${email}`,
    `Position: #${position} of ${count}`,
    `Referral code: ${code}`,
    referredBy ? `Referred by: ${referredBy}` : null,
  ].filter(Boolean);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // One ping per signup, even if the function is retried.
        'Idempotency-Key': `waitlist-signup/${id}`,
      },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM || SANDBOX_FROM,
        to: [to],
        reply_to: email,
        subject: `Hey100 signup #${position}: ${email}`,
        text: lines.join('\n'),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Resend returns 200 with an error body for some rejections, so log the body either way.
    if (!res.ok) console.error('notify failed', res.status, await res.text().catch(() => ''));
  } catch (err) {
    console.error('notify error', err);
  }
}
