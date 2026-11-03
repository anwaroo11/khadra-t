// Run: node tests/admin-ui.mjs
// اختبار متصفح كامل للوحة التحكم مع خادم محلي يشغّل نفس كود الخادم الحقيقي بمخزن في الذاكرة،
// ثم يتأكد أن الموقع العام يعرض التعديلات. يتخطى بهدوء إذا Playwright غير مثبت.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createApi } from '../netlify/lib/khadra-api.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.log('SKIP: playwright is not installed.');
  process.exit(0);
}

function memoryStore() {
  const data = new Map();
  return {
    data,
    async get(key, { type } = {}) { if (!data.has(key)) return null; const { value } = data.get(key); return type === 'json' ? JSON.parse(value) : value; },
    async getWithMetadata(key) { if (!data.has(key)) return null; const { value, metadata } = data.get(key); return { data: value, metadata, etag: 'x' }; },
    async getMetadata(key) { return data.has(key) ? { metadata: data.get(key).metadata, etag: 'x' } : null; },
    async set(key, value, { metadata } = {}) { data.set(key, { value, metadata: metadata || {} }); },
    async setJSON(key, value, { metadata } = {}) { data.set(key, { value: JSON.stringify(value), metadata: metadata || {} }); },
    async list({ prefix = '' } = {}) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    async delete(key) { data.delete(key); }
  };
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.otf': 'font/otf' };

function startServer(env) {
  const catalogStore = memoryStore();
  const imageStore = memoryStore();
  const api = createApi({ catalogStore, imageStore, env });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let response;
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const image = url.pathname.match(/^\/api\/image\/([^/]+)\/([^/]+)$/);
      response = url.pathname === '/api/catalog' ? await api.publicCatalog(request)
        : url.pathname === '/api/admin/login' ? await api.login(request)
        : image ? await api.image(request, image[1], image[2])
        : await api.admin(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    let content;
    try { content = await readFile(file); } catch { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(content);
  }).listen(0);
  return { server, catalogStore, imageStore, base: `http://localhost:${server.address().port}` };
}

const browser = await chromium.launch();
let checks = 0;
const ok = (v, m) => { checks++; assert.ok(v, m); };

async function newPage(base, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '' }));
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  return page;
}
const visible = (page, id) => page.isVisible('#' + id);

const { server, catalogStore, imageStore, base } = startServer({ ADMIN_PASSWORD: 'test-pass-123' });
try {
  const page = await newPage(base);
  await page.goto(base + '/admin/');
  await page.waitForSelector('#loginView:not([hidden])');
  ok(await visible(page, 'loginView') && !(await visible(page, 'topActions')), 'login first');

  // الدخول
  await page.fill('#password', 'غلط');
  await page.click('#loginBtn');
  await page.waitForSelector('#loginError:not([hidden])');
  ok((await page.textContent('#loginError')).includes('غلط'), 'wrong password message');
  await page.fill('#password', 'test-pass-123');
  await page.click('#loginBtn');
  await page.waitForSelector('#listView:not([hidden])');
  ok((await page.textContent('#teaCount')) === '(29)', 'all teas listed');
  ok((await page.textContent('#catalogStatus')).includes('الأصلية'), 'default catalog status');

  await page.fill('#search', 'الوزه');
  ok((await page.locator('.a-item').count()) === 2, 'search');
  await page.fill('#search', '');

  // تعديل النهرين
  await page.locator('.a-item', { hasText: 'النهرين' }).click();
  await page.waitForSelector('#editView:not([hidden])');
  ok((await page.inputValue('#fName')) === 'النهرين' && (await page.inputValue('#tNormal')) === '12', 'editor filled');
  ok((await page.inputValue('#fFullName')) === 'شاي النهرين', 'full name filled');
  await page.fill('#tNormal', '12.5');
  ok((await page.textContent('#sample')).includes('6.3 جم'), 'live sample');
  await page.click('#saveBtn');
  await page.waitForSelector('#listView:not([hidden])');
  let stored = JSON.parse((await catalogStore.get('catalog')));
  ok(stored.rev === 1 && stored.simple[0].teaPerLiterByTaste.normal === 12.5, 'edit saved');
  ok(stored.simple.length === 24 && stored.branded.length === 2, 'order kept');

  // إضافة شاي جديد: الأخطاء أولاً
  await page.click('#addTea');
  await page.waitForSelector('#editView:not([hidden])');
  await page.click('#saveBtn');
  await page.waitForSelector('#formErrors:not([hidden])');
  ok((await page.textContent('#formErrors')).includes('مطلوب') && await page.locator('#fName.is-invalid').count() === 1, 'validation shown');
  ok(!(JSON.parse(await catalogStore.get('catalog')).simple.some((t) => t.cardName === '')), 'nothing saved');

  await page.fill('#fName', 'التجربة');
  await page.fill('#fFullName', 'شاي التجربة');
  await page.fill('#fType', 'OP1');
  for (const [id, v] of [['tNormal', '11'], ['tMedium', '12'], ['tNosugar', '11'], ['sNormal', '45'], ['sMedium', '٥٠'], ['steepMin', '15'], ['steepMax', '20']]) await page.fill('#' + id, v);
  await page.check('#fFeatured');
  // صورة علبة على خلفية بيضاء
  const pngBase64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 500;
    const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 400, 500);
    x.fillStyle = '#8a1f12'; x.fillRect(110, 80, 180, 340); x.fillStyle = '#d6b26a'; x.fillRect(130, 200, 140, 40);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.setInputFiles('#imageFile', { name: 'tin.png', mimeType: 'image/png', buffer: Buffer.from(pngBase64, 'base64') });
  await page.waitForSelector('#bgControls:not([hidden])');
  await page.waitForFunction(() => document.querySelector('#previewTin').dataset.build === '1');
  await page.check('#removeBg');
  await page.waitForFunction(() => document.querySelector('#previewTin').dataset.build === '2' && document.querySelector('#previewTin img')?.complete);
  const cutout = await page.evaluate(async () => {
    const img = document.querySelector('#previewTin img');
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return { w: c.width, h: c.height, corner: x.getImageData(0, 0, 1, 1).data[3], center: [...x.getImageData(c.width / 2, c.height / 2, 1, 1).data] };
  });
  ok(Math.abs(cutout.w / cutout.h - 180 / 340) < 0.05, 'background removed and trimmed: ' + JSON.stringify(cutout));
  ok(cutout.center[3] === 255, 'tin kept opaque');
  await page.click('#saveBtn');
  await page.waitForSelector('#listView:not([hidden])');
  stored = JSON.parse(await catalogStore.get('catalog'));
  const added = stored.simple.at(-1);
  ok(stored.rev === 2 && added.cardName === 'التجربة' && added.brand === 'شاي التجربة' && added.featured === true, 'new tea saved');
  ok(added.sugarPerLiterByTaste.medium === 50 && added.sugarPerLiterByTaste.nosugar === 0, 'arabic digits & nosugar zero');
  ok(/^upload:[a-f0-9]{16}\.(webp|png)$/.test(added.image), 'image reference');
  const imageName = added.image.slice(7);
  ok(imageStore.data.has('teas/' + imageName) && imageStore.data.has('tins/' + imageName), 'both images uploaded');
  ok((await page.textContent('#teaCount')) === '(30)', 'count updated');
  ok(page.errors.length === 0, 'no admin errors: ' + page.errors.join(' | '));

  // الموقع العام يعرض التعديلات
  const site = await newPage(base, { width: 390, height: 844 });
  await site.goto(base + '/');
  await site.waitForFunction(() => window.__khadra);
  ok((await site.locator('.tea').count()) === 30, 'public site has new tea');
  const card = site.locator('.tea[aria-label="التجربة — OP1"]');
  ok((await card.locator('img').getAttribute('src')) === '/api/image/teas/' + imageName, 'public card uses uploaded image');
  ok((await site.locator('.tea').nth(4).getAttribute('aria-label')) === 'التجربة — OP1', 'featured tea listed with featured ones');
  await card.click();
  await site.waitForFunction(() => window.__khadra.screen() === 'water');
  await site.click('[data-water="500"]');
  await site.waitForFunction(() => window.__khadra.screen() === 'taste');
  await site.click('.taste[data-taste="normal"]');
  await site.waitForFunction(() => window.__khadra.screen() === 'result');
  ok((await site.textContent('#teaGrams')) === '5.5' && (await site.textContent('#sugarGrams')) === '22.5', 'new tea recipe');
  ok((await site.locator('#heroTin img').getAttribute('src')) === '/api/image/tins/' + imageName, 'uploaded cutout on recipe');
  await site.waitForFunction(() => document.querySelector('#heroTin img')?.naturalWidth > 0);
  ok((await site.evaluate(() => window.__khadra.shareText())).includes('📌 النوع: شاي التجربة (OP1)'), 'share text uses full name');
  await site.click('#favoriteToggle');
  await site.evaluate(() => { location.hash = 'tea'; });
  await site.locator('.tea[aria-label="النهرين — OP"]').click();
  await site.waitForFunction(() => window.__khadra.screen() === 'water');
  await site.click('[data-water="1000"]');
  await site.click('.taste[data-taste="normal"]');
  await site.waitForFunction(() => window.__khadra.screen() === 'result');
  ok((await site.textContent('#teaGrams')) === '12.5', 'edited recipe on public site');
  ok(site.errors.length === 0, 'no public errors: ' + site.errors.join(' | '));

  // حذف
  await page.locator('.a-item', { hasText: 'التجربة' }).click();
  await page.waitForSelector('#editView:not([hidden])');
  await page.click('#deleteBtn');
  ok(JSON.parse(await catalogStore.get('catalog')).rev === 2, 'delete needs confirm');
  await page.click('#deleteYes');
  await page.waitForSelector('#listView:not([hidden])');
  ok((await page.textContent('#teaCount')) === '(29)', 'deleted');
  // المفضلة اللي تخص النوع المحذوف تختفي بهدوء في الموقع
  await site.reload();
  await site.waitForFunction(() => window.__khadra);
  ok((await site.evaluate(() => window.__khadra.getFavorites().length)) === 0 && site.errors.length === 0, 'deleted favorite dropped safely');

  // السجل والاسترجاع
  await page.click('#openHistory');
  await page.waitForSelector('#historyView:not([hidden])');
  ok((await page.locator('#historyList li').count()) === 3, 'history entries');
  await page.locator('#historyList li').last().getByRole('button', { name: 'استرجاع' }).click();
  await page.locator('#historyList li').last().getByRole('button', { name: 'نعم' }).click();
  await page.waitForSelector('#listView:not([hidden])');
  stored = JSON.parse(await catalogStore.get('catalog'));
  ok(stored.rev === 4 && stored.simple[0].teaPerLiterByTaste.normal === 12, 'restored original');

  // المقاسات
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, 'list overflow ' + width);
    await page.locator('.a-item').first().click();
    await page.waitForSelector('#editView:not([hidden])');
    ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, 'edit overflow ' + width);
    await page.click('#cancelEdit');
  }

  // الخروج
  await page.click('#logoutBtn');
  await page.reload();
  await page.waitForSelector('#loginView:not([hidden])');
  ok(true, 'logged out');
  ok(page.errors.length === 0, 'no admin errors: ' + page.errors.join(' | '));
  await page.context().close();
  await site.context().close();
} finally {
  server.close();
}

// بدون كلمة مرور في Netlify: شاشة الإعداد
{
  const { server: s2, base: b2 } = startServer({});
  try {
    const page = await newPage(b2);
    await page.goto(b2 + '/admin/');
    await page.waitForSelector('#setupView:not([hidden])');
    ok((await page.textContent('#setupView')).includes('ADMIN_PASSWORD'), 'setup instructions');
    await page.context().close();
  } finally { s2.close(); }
}
await browser.close();
console.log({ adminUiChecks: checks, failures: 0 });
