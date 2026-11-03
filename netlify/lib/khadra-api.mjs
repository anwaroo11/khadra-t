// منطق خادم لوحة التحكم — مستقل عن Netlify حتى يمكن اختباره بمخزن في الذاكرة.
// الدوال في netlify/functions/ تمرّر مخازن Netlify Blobs الحقيقية فقط.
import { createHmac, createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import Catalog from '../../assets/catalog.js';
import bundled from '../../assets/data.js';

export const SESSION_COOKIE = '__Host-khadra-admin';
const SESSION_TTL = 12 * 60 * 60; // 12 ساعة
const HISTORY_KEEP = 15;
const MAX_IMAGE_BYTES = 900 * 1024;
const MAX_CATALOG_BYTES = 512 * 1024;
const IMAGE_NAME = /^[a-z0-9-]{6,60}\.(webp|png)$/;
const KINDS = ['teas', 'tins'];

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
});
const empty = (status, headers = {}) => new Response(null, { status, headers: { 'cache-control': 'no-store', ...headers } });

function sessionKey(password) {
  return createHash('sha256').update('khadra-admin-session:' + password).digest();
}
function sign(key, value) {
  return createHmac('sha256', key).update('admin:' + value).digest('hex');
}
function safeEqual(a, b) {
  const x = createHash('sha256').update(String(a)).digest();
  const y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
}
function readCookie(request, name) {
  return (request.headers.get('cookie') || '').split(';').map((s) => s.trim())
    .find((s) => s.startsWith(name + '='))?.slice(name.length + 1) || '';
}

export function defaultCatalog() {
  return Catalog.fromBundled(bundled);
}

export function createApi({ catalogStore, imageStore, env = process.env, now = () => Date.now() }) {
  const password = () => (typeof env.ADMIN_PASSWORD === 'string' ? env.ADMIN_PASSWORD : '');
  const seconds = () => Math.floor(now() / 1000);

  function isAuthed(request) {
    const pass = password();
    if (!pass) return false;
    const [exp, sig] = readCookie(request, SESSION_COOKIE).split('.');
    if (!/^\d{9,11}$/.test(exp || '') || !/^[a-f0-9]{64}$/.test(sig || '')) return false;
    const t = Number(exp);
    if (t <= seconds() || t > seconds() + SESSION_TTL) return false;
    return timingSafeEqual(Buffer.from(sig), Buffer.from(sign(sessionKey(pass), exp)));
  }

  // الطلبات اللي تغيّر شي لازم تجي من نفس الموقع (حماية من CSRF مع SameSite=Strict).
  function sameOrigin(request) {
    const origin = new URL(request.url).origin;
    return request.headers.get('origin') === origin && request.headers.get('x-khadra-admin') === '1';
  }

  async function readCatalog() {
    const stored = await catalogStore.get('catalog', { type: 'json' });
    if (stored) {
      const v = Catalog.validate(stored);
      if (v.ok) return v.data;
    }
    return null;
  }

  async function saveCatalog(next, previous) {
    const data = { ...next, rev: (previous ? previous.rev : 0) + 1, updatedAt: new Date(now()).toISOString() };
    if (previous) {
      await catalogStore.setJSON('history/' + String(previous.rev).padStart(8, '0'), previous, {
        metadata: { rev: previous.rev, updatedAt: previous.updatedAt || '', count: countTeas(previous) }
      });
      const { blobs } = await catalogStore.list({ prefix: 'history/' });
      const old = blobs.map((b) => b.key).sort().slice(0, Math.max(0, blobs.length - HISTORY_KEEP));
      await Promise.all(old.map((key) => catalogStore.delete(key)));
    }
    await catalogStore.setJSON('catalog', data);
    return data;
  }

  const countTeas = (c) => c.simple.length + c.branded.reduce((n, g) => n + g.items.length, 0);

  async function readBody(request, limit) {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > limit) return null;
    const buffer = await request.arrayBuffer();
    return buffer.byteLength > limit ? null : buffer;
  }

  return {
    // POST /api/admin/login  { password }
    async login(request) {
      if (request.method !== 'POST') return empty(405, { allow: 'POST' });
      if (!sameOrigin(request)) return json(403, { error: 'origin' });
      const pass = password();
      if (!pass) return json(503, { error: 'not-configured' });
      let body;
      try { body = JSON.parse(new TextDecoder().decode(await readBody(request, 4096) || new ArrayBuffer(0))); } catch { body = null; }
      if (!body || typeof body.password !== 'string' || !safeEqual(body.password, pass)) {
        return json(401, { error: 'wrong-password' });
      }
      const exp = String(seconds() + SESSION_TTL);
      return empty(204, {
        'set-cookie': `${SESSION_COOKIE}=${exp}.${sign(sessionKey(pass), exp)}; Path=/; Max-Age=${SESSION_TTL}; Secure; HttpOnly; SameSite=Strict`
      });
    },

    // /api/admin/*
    async admin(request) {
      const url = new URL(request.url);
      const route = url.pathname.replace(/^\/api\/admin\/?/, '');
      const method = request.method;
      if (method !== 'GET' && !sameOrigin(request)) return json(403, { error: 'origin' });
      if (route === 'logout' && method === 'POST') {
        return empty(204, { 'set-cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict` });
      }
      if (!password()) return json(503, { error: 'not-configured' });
      if (!isAuthed(request)) return json(401, { error: 'login' });

      if (route === 'session' && method === 'GET') return json(200, { ok: true });

      if (route === 'catalog' && method === 'GET') {
        const stored = await readCatalog();
        return json(200, { catalog: stored || defaultCatalog(), custom: Boolean(stored) });
      }

      if (route === 'catalog' && method === 'PUT') {
        const buffer = await readBody(request, MAX_CATALOG_BYTES);
        if (!buffer) return json(413, { error: 'too-large' });
        let body;
        try { body = JSON.parse(new TextDecoder().decode(buffer)); } catch { return json(400, { error: 'json' }); }
        const current = await readCatalog();
        const currentRev = current ? current.rev : 0;
        if (!body || body.baseRev !== currentRev) return json(409, { error: 'conflict', rev: currentRev });
        const v = Catalog.validate({ ...body.catalog, version: 1 });
        if (!v.ok) return json(422, { error: 'invalid', errors: v.errors.slice(0, 20) });
        const saved = await saveCatalog(v.data, current || { ...defaultCatalog(), rev: 0, updatedAt: '' });
        return json(200, { rev: saved.rev, updatedAt: saved.updatedAt });
      }

      if (route === 'history' && method === 'GET') {
        const { blobs } = await catalogStore.list({ prefix: 'history/' });
        const items = [];
        for (const blob of blobs.map((b) => b.key).sort().reverse()) {
          const meta = await catalogStore.getMetadata(blob);
          if (meta) items.push({ key: blob.slice(8), rev: meta.metadata.rev, updatedAt: meta.metadata.updatedAt, count: meta.metadata.count });
        }
        return json(200, { items });
      }

      const restore = route.match(/^history\/(\d{8})\/restore$/);
      if (restore && method === 'POST') {
        const old = await catalogStore.get('history/' + restore[1], { type: 'json' });
        const v = old && Catalog.validate(old);
        if (!v || !v.ok) return json(404, { error: 'not-found' });
        const current = await readCatalog();
        const saved = await saveCatalog(v.data, current || { ...defaultCatalog(), rev: 0, updatedAt: '' });
        return json(200, { rev: saved.rev, updatedAt: saved.updatedAt });
      }

      const image = route.match(/^image\/(teas|tins)\/([^/]+)$/);
      if (image && method === 'PUT') {
        const [, kind, name] = image;
        if (!IMAGE_NAME.test(name)) return json(400, { error: 'name' });
        const buffer = await readBody(request, MAX_IMAGE_BYTES);
        if (!buffer) return json(413, { error: 'too-large' });
        const bytes = new Uint8Array(buffer);
        const isWebp = bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
        const isPng = bytes.length > 8 && bytes[0] === 0x89 && String.fromCharCode(...bytes.slice(1, 4)) === 'PNG';
        const type = name.endsWith('.webp') ? 'image/webp' : 'image/png';
        if ((type === 'image/webp' && !isWebp) || (type === 'image/png' && !isPng)) return json(415, { error: 'type' });
        await imageStore.set(kind + '/' + name, buffer, { metadata: { type } });
        return json(200, { image: 'upload:' + name });
      }

      return json(404, { error: 'not-found' });
    },

    // GET /api/catalog — الكتالوج العام للموقع؛ 404 يعني استخدم الكتالوج الأصلي المدمج.
    async publicCatalog(request) {
      if (request.method !== 'GET') return empty(405, { allow: 'GET' });
      const stored = await readCatalog();
      if (!stored) return json(404, { error: 'default' }, { 'cache-control': 'public, max-age=0, must-revalidate', 'netlify-cdn-cache-control': 'public, s-maxage=20, stale-while-revalidate=120' });
      return json(200, stored, { 'cache-control': 'public, max-age=0, must-revalidate', 'netlify-cdn-cache-control': 'public, s-maxage=20, stale-while-revalidate=120' });
    },

    // GET /api/image/:kind/:name — صور الشاي المرفوعة (أسماؤها عشوائية فتنخزن مؤقتاً للأبد).
    async image(request, kind, name) {
      if (request.method !== 'GET') return empty(405, { allow: 'GET' });
      if (!KINDS.includes(kind) || !IMAGE_NAME.test(name || '')) return empty(404);
      const found = await imageStore.getWithMetadata(kind + '/' + name, { type: 'arrayBuffer' });
      if (!found) return empty(404);
      return new Response(found.data, {
        status: 200,
        headers: {
          'content-type': found.metadata?.type === 'image/png' ? 'image/png' : 'image/webp',
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff'
        }
      });
    }
  };
}

export const randomImageName = () => randomBytes(9).toString('hex');
