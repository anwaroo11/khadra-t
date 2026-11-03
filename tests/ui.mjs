// Run: node tests/ui.mjs
// اختبار المتصفح الحقيقي للواجهة الجديدة (Playwright). يتخطى بهدوء إذا Playwright غير مثبت.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.log('SKIP: playwright is not installed.');
  process.exit(0);
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.otf': 'font/otf' };
const server = createServer(async (req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;

// نفس المنطق للمقارنة.
const ctx = vm.createContext({});
for (const f of ['assets/data.js', 'assets/core.js']) vm.runInContext(await readFile(path.join(root, f), 'utf8'), ctx);
const Core = ctx.KhadraCore;
const expectedText = (state) => Core.shareText(Core.calculate({ ...Core.defaultState(), ...state }));

const browser = await chromium.launch();
let checks = 0;
const ok = (value, message) => { checks++; assert.ok(value, message); };

async function open(storage = {}, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  if (options.blockStorage) {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } });
    });
  } else {
    await context.addInitScript((data) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
    }, storage);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|visit/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  page.errors = errors;
  return page;
}
const app = (page) => page.evaluate(() => ({
  state: window.__khadra.getState(), favorites: window.__khadra.getFavorites(),
  recent: window.__khadra.getRecent(), text: window.__khadra.shareText(),
  stored: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))
}));

try {
  // 1) أول فتح: نفس النتيجة الافتراضية، ولا يحفظ شيء.
  {
    const page = await open();
    const a = await app(page);
    ok(a.text === expectedText({}), 'default result');
    ok(!a.stored[Core.KEYS.selection] && !a.stored[Core.KEYS.recent], 'nothing saved on first load');
    ok((await page.textContent('#teaGrams')) === '12' && (await page.textContent('#sugarGrams')) === '50', 'default amounts shown');

    // اختيار شاي من القائمة: يتحدث الحساب بدون ما ينحفظ في السجل.
    await page.click('#openPicker');
    await page.fill('#teaSearch', 'الوزه');
    ok((await page.locator('.tea-card').count()) === 2, 'search filters catalog');
    await page.locator('.tea-card', { hasText: 'FBOB1' }).click();
    let s = await app(page);
    ok(s.state.product === 'brand:wazah' && s.state.subtype === 'wazah-fbob1', 'picked subtype');
    ok(s.recent.length === 0, 'picking does not commit');
    ok(JSON.parse(s.stored[Core.KEYS.selection]).subtype === 'wazah-fbob1', 'selection saved after change');
    ok((await page.locator('#subtypeChips .chip').count()) === 2, 'subtype chips');
    await page.locator('#subtypeChips .chip', { hasText: 'OP1' }).click();
    ok((await app(page)).state.subtype === 'wazah-op1', 'subtype chip switches');

    // الحساب يحفظ مرة وحدة فقط.
    await page.click('#calculateBtn');
    await page.click('#calculateBtn');
    s = await app(page);
    ok(s.recent.length === 1 && s.recent[0].subtype === 'wazah-op1', 'calculate commits once');

    // كمية مخصصة فاضية = خطأ واضح بدون أزرار مشاركة.
    await page.click('[data-water="custom"]');
    ok(await page.isVisible('#brewError') && !(await page.isVisible('#copyBtn')), 'empty custom water error');
    ok((await page.textContent('#brewErrorText')).includes('بين 1 و100000'), 'error message');
    await page.click('#calculateBtn');
    ok((await app(page)).recent.length === 1, 'invalid calculate not committed');
    await page.fill('#customWater', '٧٨٠٫٥');
    ok((await app(page)).text === expectedText({ product: 'brand:wazah', subtype: 'wazah-op1', water: '780.5', waterMode: 'custom' }), 'arabic digits');

    // المذاق + المفضلة.
    await page.click('[data-taste="medium"]');
    await page.click('#favoriteToggle');
    s = await app(page);
    ok(s.favorites.length === 1 && JSON.parse(s.stored[Core.KEYS.favorites]).items[0].subtype === 'wazah-op1', 'favorite saved');
    ok((await page.getAttribute('#favoriteToggle', 'aria-pressed')) === 'true', 'favorite pressed');
    ok((await page.textContent('#favoritesCount')) === '1', 'favorite count badge');

    // الوزنة اليدوية: صفر سكر = بدون سكر، ونص المدة لا يُفسَّر كـ HTML.
    await page.click('#modeManual');
    await page.fill('#manualTea', '12.55');
    await page.fill('#manualSugar', '0');
    await page.fill('#manualSteep', '<img src=x onerror="window.__xss=1">');
    ok((await page.textContent('#sugarGrams')) === 'بدون سكر', 'manual zero sugar');
    ok(!(await page.evaluate(() => window.__xss)) && (await page.locator('#brewCard img[src="x"]').count()) === 0, 'steep text is not HTML');
    ok(await page.isHidden('#favoriteToggle'), 'no favorite in manual mode');
    await page.fill('#manualSteep', '20-25 دقيقة');
    await page.click('#calculateBtn');
    s = await app(page);
    ok(s.recent[0].mode === 'manual' && s.recent[0].sugarPerLiter === '0', 'manual committed');

    // صفحة المفضلة: الاختيار يرجع للحاسبة بنفس الماء والمذاق.
    await page.click('.nav-btn[data-view="favorites"]');
    ok(await page.isVisible('#favoritesView') && !(await page.isVisible('#calculatorView')), 'favorites view');
    await page.click('.fav-pick');
    s = await app(page);
    ok(s.state.mode === 'tea' && s.state.subtype === 'wazah-op1' && s.state.taste === 'medium' && Core.normalizeDigits(s.state.water) === '780.5', 'favorite keeps taste/water');
    ok(s.recent.length === 3 && await page.isVisible('#calculatorView'), 'favorite select commits and returns');

    // آخر الخدرات: إعادة خدرة قديمة تنقلها للأعلى بدون تكرار.
    await page.click('.nav-btn[data-view="recent"]');
    ok((await page.locator('.recent-btn').count()) === 3, 'recent list');
    await page.locator('.recent-btn').nth(2).click();
    s = await app(page);
    ok(s.recent.length === 3 && s.recent[0].subtype === 'wazah-op1' && s.recent[0].taste === 'normal', 'replay moves to top');
    ok(s.text === expectedText({ product: 'brand:wazah', subtype: 'wazah-op1', water: '1000' }), 'replay result');

    // المسح يحتاج تأكيد.
    await page.click('.nav-btn[data-view="recent"]');
    await page.click('#clearRecent');
    ok((await app(page)).recent.length === 3, 'clear needs confirmation');
    await page.click('#clearYes');
    s = await app(page);
    ok(s.recent.length === 0 && JSON.parse(s.stored[Core.KEYS.recent]).items.length === 0 && await page.isVisible('#recentEmpty'), 'cleared');

    // إعادة التحميل تسترجع آخر اختيار بدون إضافة للسجل.
    const before = (await app(page)).text;
    await page.reload();
    s = await app(page);
    ok(s.text === before && s.recent.length === 0 && s.favorites.length === 1, 'reload restores');
    ok(page.errors.length === 0, 'no console errors: ' + page.errors.join(' | '));
    await page.context().close();
  }

  // 2) بيانات محفوظة بصيغة النسخة السابقة تشتغل كما هي.
  {
    const legacy = {
      [Core.KEYS.selection]: JSON.stringify({ version: 1, mode: 'tea', product: 'brand:munais', subtype: 'munais-bop1', taste: 'nosugar', waterMl: '780.5', waterMode: 'custom', manual: null }),
      [Core.KEYS.favorites]: JSON.stringify({ version: 1, items: [{ product: 'simple:khabt-bop1', subtype: null }, { product: 'simple:removed', subtype: null }] }),
      [Core.KEYS.recent]: JSON.stringify({ version: 1, items: [{ mode: 'manual', teaPerLiter: '12', sugarPerLiter: '50', steepMinutes: '', waterMl: '500', waterMode: 'preset' }, { bad: true }] })
    };
    const page = await open(legacy);
    const a = await app(page);
    ok(a.text === expectedText({ product: 'brand:munais', subtype: 'munais-bop1', taste: 'nosugar', water: '780.5', waterMode: 'custom' }), 'legacy selection');
    ok(a.favorites.length === 1 && a.recent.length === 1, 'legacy collections filtered');
    ok(await page.isVisible('#customWaterField'), 'custom water restored');
    ok(await page.isVisible('#quickFavorites'), 'quick favorites shown');
    await page.context().close();
  }

  // 3) التخزين محجوب: الحاسبة تشتغل.
  {
    const page = await open({}, { blockStorage: true });
    await page.click('[data-water="500"]');
    ok((await page.textContent('#teaGrams')) === '6', 'works without storage');
    await page.click('#calculateBtn');
    ok((await page.textContent('#storageNotice')).includes('تعذر الحفظ'), 'storage failure notice');
    await page.context().close();
  }

  // 4) النسخ والواتساب يرسلون نفس النص.
  {
    const page = await open({}, { permissions: ['clipboard-read', 'clipboard-write'] });
    await page.click('#copyBtn');
    await page.waitForFunction(() => document.querySelector('#copyBtn span').textContent.includes('✓'));
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    ok(copied === expectedText({}), 'clipboard text');
    const href = await page.getAttribute('#whatsappBtn', 'href');
    ok(decodeURIComponent(href.split('?text=')[1]) === expectedText({}), 'whatsapp text');
    await page.context().close();
  }

  // 5) لا يوجد تمرير أفقي في أي عرض أو مقاس أو وضع.
  for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 768, 1024, 1366]) {
    const page = await open({}, { viewport: { width, height: 900 }, colorScheme });
    for (const view of ['calculator', 'favorites', 'recent']) {
      await page.evaluate((v) => { location.hash = v; }, view);
      await page.waitForTimeout(50);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      ok(overflow <= 0, `overflow ${overflow}px at ${width} ${view} ${colorScheme}`);
    }
    await page.evaluate(() => { location.hash = 'calculator'; });
    await page.click('#modeManual');
    ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `manual overflow at ${width}`);
    await page.context().close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log({ uiChecks: checks, failures: 0 });
