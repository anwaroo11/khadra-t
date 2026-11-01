import { createHmac, timingSafeEqual } from 'node:crypto';

const ORIGIN = 'https://khadra-t.netlify.app';
const COOKIE = '__Host-khadra-visit';
const TTL = 1800;
const reply = (status, headers = {}) => new Response(null, {
  status, headers: { 'Cache-Control': 'no-store', ...headers }
});
const sign = (value, key) => createHmac('sha256', key).update(`visit:${value}`).digest('hex');

export default async function visit(request) {
  if (request.method !== 'POST') return reply(405, { Allow: 'POST' });
  // Never send notifications from deploy previews, forks or other origins.
  if (process.env.CONTEXT !== 'production') return reply(204);
  if (new URL(request.url).origin !== ORIGIN || request.headers.get('origin') !== ORIGIN)
    return reply(403);
  if (request.headers.get('x-khadra-visit') !== '1') return reply(403);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return reply(503);

  const now = Math.floor(Date.now() / 1000);
  const cookie = (request.headers.get('cookie') || '').split(';').map(s => s.trim())
    .find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
  const [expires, signature] = cookie.split('.');
  if (/^\d+$/.test(expires) && /^[a-f0-9]{64}$/.test(signature || '') &&
      Number(expires) > now && Number(expires) <= now + TTL &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(sign(expires, token)))) return reply(204);

  const expiry = String(now + TTL);
  // Also suppress retries on ambiguous network failures: avoid duplicate messages.
  const headers = { 'Set-Cookie': `${COOKIE}=${expiry}.${sign(expiry, token)}; Path=/; Max-Age=${TTL}; Secure; HttpOnly; SameSite=Strict` };
  const time = new Intl.DateTimeFormat('ar-SA', {
    timeZone: 'Asia/Riyadh', dateStyle: 'short', timeStyle: 'short'
  }).format(new Date());
  try {
    const result = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `☕ زيارة إلى خدرة شاي\n🕒 ${time} (توقيت السعودية)\n${ORIGIN}` }),
      signal: AbortSignal.timeout(5000)
    });
    const data = await result.json();
    if (!result.ok || data.ok !== true) return reply(502, headers);
    return reply(204, headers);
  } catch {
    // Do not log the exception: its URL may contain the bot token.
    return reply(502, headers);
  }
}

export const config = {
  rateLimit: { windowLimit: 3, windowSize: 180, aggregateBy: ['ip', 'domain'] }
};
