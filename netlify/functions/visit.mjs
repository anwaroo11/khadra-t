import { createHmac, timingSafeEqual, randomInt } from 'node:crypto';

const ORIGIN = 'https://khadra-t.netlify.app';
const COOKIE = '__Host-khadra-visit';
const TTL = 1800;
const reply = (status, headers = {}) => {
  const resultHeaders = new Headers(headers);
  resultHeaders.set('Cache-Control', 'no-store');
  return new Response(null, { status, headers: resultHeaders });
};
const sign = (value, key) => createHmac('sha256', key).update(`visit:${value}`).digest('hex');

export default async function visit(request, context = {}) {
  if (request.method !== 'POST') return reply(405, { Allow: 'POST' });
  // Never send notifications from deploy previews, forks or other origins.
  if (new URL(request.url).origin !== ORIGIN || request.headers.get('origin') !== ORIGIN)
    return reply(403);
  if (request.headers.get('x-khadra-visit') !== '1') return reply(403);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return reply(503);

  const visitorCookie = (request.headers.get('cookie') || '').split(';').map(s => s.trim())
    .find(s => s.startsWith('__Host-khadra-visitor='))?.split('=')[1] || '';
  const [savedId, savedSignature] = visitorCookie.split('.');
  const returning = /^\d{14}$/.test(savedId || '') && /^[a-f0-9]{64}$/.test(savedSignature || '') &&
    timingSafeEqual(Buffer.from(savedSignature), Buffer.from(sign(`visitor:${savedId}`, token)));
  const visitorId = returning ? savedId : String(randomInt(10000000000000, 100000000000000));
  // Use only coarse platform geolocation; never send IP or coordinates.
  const clean = value => typeof value === 'string' ? value.replace(/[\r\n\x00-\x1f]/g, ' ').slice(0, 100) : '';
  const geo = context.geo || {};
  const place = [geo.country?.name, geo.subdivision?.name, geo.city].map(clean).filter(Boolean).join('، ') || 'غير متاح';

  const now = Math.floor(Date.now() / 1000);
  const cookie = (request.headers.get('cookie') || '').split(';').map(s => s.trim())
    .find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
  const [expires, signature] = cookie.split('.');
  if (/^\d+$/.test(expires) && /^[a-f0-9]{64}$/.test(signature || '') &&
      Number(expires) > now && Number(expires) <= now + TTL &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(sign(expires, token)))) return reply(204);

  const expiry = String(now + TTL);
  // Also suppress retries on ambiguous network failures: avoid duplicate messages.
  const headers = new Headers({ 'Set-Cookie': `${COOKIE}=${expiry}.${sign(expiry, token)}; Path=/; Max-Age=${TTL}; Secure; HttpOnly; SameSite=Strict` });
  headers.append('Set-Cookie', `__Host-khadra-visitor=${visitorId}.${sign(`visitor:${visitorId}`, token)}; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Strict`);
  const time = new Intl.DateTimeFormat('ar-SA', {
    timeZone: 'Asia/Riyadh', dateStyle: 'short', timeStyle: 'short'
  }).format(new Date());
  try {
    const result = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `☕ زيارة إلى خدرة شاي\n👤 رقم المتصفح: ${visitorId}\n🔁 ${returning ? 'زيارة متكررة' : 'أول زيارة مسجلة لهذا المتصفح'}\n📍 الموقع التقريبي: ${place}\n🕒 ${time} (توقيت السعودية)\n${ORIGIN}` }),
      signal: AbortSignal.timeout(5000)
    });
    const data = await result.json();
    if (!result.ok || data.ok !== true) return reply(502, headers);
    headers.set('X-Khadra-Notification', 'sent');
    return reply(204, headers);
  } catch {
    // Do not log the exception: its URL may contain the bot token.
    return reply(502, headers);
  }
}

export const config = {
  rateLimit: { windowLimit: 3, windowSize: 180, aggregateBy: ['ip', 'domain'] }
};
