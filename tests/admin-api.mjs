// Run: node tests/admin-api.mjs
// خادم لوحة التحكم بمخزن في الذاكرة: الدخول، الحماية، الحفظ، التعارض، السجل، الصور، والكتالوج العام.
import assert from 'node:assert/strict';
import { createApi, defaultCatalog, SESSION_COOKIE } from '../netlify/lib/khadra-api.mjs';

function memoryStore() {
  const data = new Map();
  return {
    data,
    async get(key, { type } = {}) {
      if (!data.has(key)) return null;
      const { value } = data.get(key);
      return type === 'json' ? JSON.parse(value) : value;
    },
    async getWithMetadata(key) {
      if (!data.has(key)) return null;
      const { value, metadata } = data.get(key);
      return { data: value, metadata, etag: 'x' };
    },
    async getMetadata(key) { return data.has(key) ? { metadata: data.get(key).metadata, etag: 'x' } : null; },
    async set(key, value, { metadata } = {}) { data.set(key, { value, metadata: metadata || {} }); },
    async setJSON(key, value, { metadata } = {}) { data.set(key, { value: JSON.stringify(value), metadata: metadata || {} }); },
    async list({ prefix = '' } = {}) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, etag: 'x' })), directories: [] }; },
    async delete(key) { data.delete(key); }
  };
}

const ORIGIN = 'https://khadra-t.netlify.app';
let clock = Date.UTC(2026, 10, 3, 12);
const catalogStore = memoryStore();
const imageStore = memoryStore();
const env = { ADMIN_PASSWORD: 'شاي-سري-123' };
const api = createApi({ catalogStore, imageStore, env, now: () => clock });
let checks = 0;
const ok = (v, m) => { checks++; assert.ok(v, m); };

const req = (path, { method = 'GET', body, cookie = '', origin = ORIGIN, admin = true, headers = {} } = {}) =>
  new Request(ORIGIN + path, {
    method,
    headers: { ...(origin ? { origin } : {}), ...(admin ? { 'x-khadra-admin': '1' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : (body instanceof Uint8Array || typeof body === 'string' ? body : JSON.stringify(body))
  });
const login = (password, opts) => api.login(req('/api/admin/login', { method: 'POST', body: { password }, ...opts }));

// 1) الدخول
ok((await api.login(req('/api/admin/login'))).status === 405, 'login GET');
ok((await login(env.ADMIN_PASSWORD, { origin: 'https://evil.example' })).status === 403, 'login cross-origin');
ok((await login(env.ADMIN_PASSWORD, { admin: false })).status === 403, 'login without header');
ok((await login('غلط')).status === 401, 'wrong password');
ok((await login('')).status === 401, 'empty password');
ok((await api.login(req('/api/admin/login', { method: 'POST', body: 'not json' }))).status === 401, 'bad body');
{
  const none = createApi({ catalogStore, imageStore, env: {}, now: () => clock });
  ok((await none.login(req('/api/admin/login', { method: 'POST', body: { password: '' } }))).status === 503, 'no password configured');
  ok((await none.admin(req('/api/admin/catalog', { cookie: 'x' }))).status === 503, 'admin not configured');
}
const loginRes = await login(env.ADMIN_PASSWORD);
ok(loginRes.status === 204, 'login ok');
const setCookie = loginRes.headers.get('set-cookie');
ok(/HttpOnly/.test(setCookie) && /Secure/.test(setCookie) && /SameSite=Strict/.test(setCookie) && !setCookie.includes(env.ADMIN_PASSWORD), 'cookie flags');
const cookie = setCookie.split(';')[0];

// 2) الحماية
ok((await api.admin(req('/api/admin/catalog'))).status === 401, 'no cookie');
ok((await api.admin(req('/api/admin/catalog', { cookie: cookie.replace(/\.[a-f0-9]/, '.0') }))).status === 401, 'tampered cookie');
ok((await api.admin(req('/api/admin/catalog', { cookie: `${SESSION_COOKIE}=99999999999.${'a'.repeat(64)}` }))).status === 401, 'forged far-future cookie');
ok((await api.admin(req('/api/admin/catalog', { method: 'PUT', cookie, origin: 'https://evil.example', body: {} }))).status === 403, 'PUT cross-origin');
ok((await api.admin(req('/api/admin/session', { cookie }))).status === 200, 'session ok');
{
  const other = createApi({ catalogStore, imageStore, env: { ADMIN_PASSWORD: 'كلمة جديدة' }, now: () => clock });
  ok((await other.admin(req('/api/admin/session', { cookie }))).status === 401, 'password change logs out');
  const later = createApi({ catalogStore, imageStore, env, now: () => clock + 13 * 3600 * 1000 });
  ok((await later.admin(req('/api/admin/session', { cookie }))).status === 401, 'session expires');
}

// 3) الكتالوج: افتراضي، حفظ، تعارض، تحقق
ok((await api.publicCatalog(req('/api/catalog'))).status === 404, 'public default = 404');
let res = await api.admin(req('/api/admin/catalog', { cookie }));
let body = await res.json();
ok(res.status === 200 && body.custom === false && body.catalog.rev === 0, 'default catalog for editing');
ok(JSON.stringify(body.catalog) === JSON.stringify(defaultCatalog()), 'default equals bundled');

const edited = structuredClone(body.catalog);
edited.simple[0].teaPerLiterByTaste.normal = 12.5;
edited.simple.push({ id: 't-abc123', brand: 'شاي جديد', cardName: 'جديد', teaType: 'OPA', image: 'upload:abcdef123.webp',
  teaPerLiterByTaste: { normal: 10, medium: 11, nosugar: 10 }, sugarPerLiterByTaste: { normal: 50, medium: 55, nosugar: 0 }, steepMinutes: { min: 20, max: 25 } });
res = await api.admin(req('/api/admin/catalog', { method: 'PUT', cookie, body: { baseRev: 5, catalog: edited } }));
ok(res.status === 409 && (await res.json()).rev === 0, 'stale baseRev conflict');
const invalid = structuredClone(edited); invalid.simple[1].cardName = '<b>x</b>';
res = await api.admin(req('/api/admin/catalog', { method: 'PUT', cookie, body: { baseRev: 0, catalog: invalid } }));
ok(res.status === 422 && (await res.json()).errors.length > 0, 'invalid catalog rejected');
ok(!(await catalogStore.get('catalog')), 'nothing saved on invalid');
res = await api.admin(req('/api/admin/catalog', { method: 'PUT', cookie, body: '{nope' }));
ok(res.status === 400, 'bad json');
res = await api.admin(req('/api/admin/catalog', { method: 'PUT', cookie, body: 'x'.repeat(600 * 1024) }));
ok(res.status === 413, 'too large catalog');

res = await api.admin(req('/api/admin/catalog', { method: 'PUT', cookie, body: { baseRev: 0, catalog: edited } }));
body = await res.json();
ok(res.status === 200 && body.rev === 1, 'saved rev 1');
res = await api.publicCatalog(req('/api/catalog'));
const pub = await res.json();
ok(res.status === 200 && pub.rev === 1 && pub.simple.at(-1).id === 't-abc123' && pub.simple[0].teaPerLiterByTaste.normal === 12.5, 'public catalog updated');
ok(/s-maxage=20/.test(res.headers.get('netlify-cdn-cache-control')), 'public catalog short CDN cache');

// 4) السجل والاسترجاع
for (let i = 2; i <= 18; i++) {
  clock += 60000;
  const c = structuredClone(edited); c.simple[0].steepMinutes = { min: 20, max: 20 + i };
  res = await api.admin(req('/api/admin/catalog', { method: 'PUT', cookie, body: { baseRev: i - 1, catalog: c } }));
  ok(res.status === 200 && (await res.json()).rev === i, 'save rev ' + i);
}
res = await api.admin(req('/api/admin/history', { cookie }));
const history = (await res.json()).items;
ok(history.length === 15 && history[0].rev === 17 && history.at(-1).rev === 3, 'history keeps last 15, newest first');
ok(history[0].count === 30, 'history count');
res = await api.admin(req(`/api/admin/history/${history.at(-1).key}/restore`, { method: 'POST', cookie }));
ok(res.status === 200 && (await res.json()).rev === 19, 'restore saves as new rev');
const restored = await catalogStore.get('catalog', { type: 'json' });
ok(restored.simple[0].steepMinutes.max === 23, 'restored content');
ok((await api.admin(req('/api/admin/history/99999999/restore', { method: 'POST', cookie }))).status === 404, 'restore missing');

// 5) الصور
const webp = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBPVP8 '), 1, 2, 3]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
ok((await api.admin(req('/api/admin/image/teas/abcdef123.webp', { method: 'PUT', body: webp }))).status === 401, 'image needs login');
res = await api.admin(req('/api/admin/image/teas/abcdef123.webp', { method: 'PUT', cookie, body: webp }));
ok(res.status === 200 && (await res.json()).image === 'upload:abcdef123.webp', 'upload webp');
ok((await api.admin(req('/api/admin/image/tins/abcdef123.png', { method: 'PUT', cookie, body: png }))).status === 200, 'upload png');
ok((await api.admin(req('/api/admin/image/teas/abcdef124.webp', { method: 'PUT', cookie, body: png }))).status === 415, 'wrong magic');
ok((await api.admin(req('/api/admin/image/teas/abcdef125.webp', { method: 'PUT', cookie, body: new TextEncoder().encode('<svg onload=alert(1)>') }))).status === 415, 'svg/html rejected');
ok((await api.admin(req('/api/admin/image/teas/..%2Fx.webp', { method: 'PUT', cookie, body: webp }))).status !== 200, 'traversal name');
ok((await api.admin(req('/api/admin/image/other/abcdef123.webp', { method: 'PUT', cookie, body: webp }))).status === 404, 'bad kind');
ok((await api.admin(req('/api/admin/image/teas/abcdef126.webp', { method: 'PUT', cookie, body: new Uint8Array(1000 * 1024) }))).status === 413, 'too large image');
res = await api.image(req('/api/image/teas/abcdef123.webp'), 'teas', 'abcdef123.webp');
ok(res.status === 200 && res.headers.get('content-type') === 'image/webp' && /immutable/.test(res.headers.get('cache-control')), 'serve image');
ok((await api.image(req('/x'), 'tins', 'abcdef123.png')).headers.get('content-type') === 'image/png', 'serve png');
ok((await api.image(req('/x'), 'teas', 'missing1.webp')).status === 404, 'missing image');
ok((await api.image(req('/x'), 'teas', '../catalog')).status === 404, 'image traversal');

// 6) الخروج
res = await api.admin(req('/api/admin/logout', { method: 'POST', cookie }));
ok(res.status === 204 && /Max-Age=0/.test(res.headers.get('set-cookie')), 'logout clears cookie');
console.log({ adminApiChecks: checks, failures: 0 });
