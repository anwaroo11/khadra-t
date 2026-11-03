// Run: node tests/ui.mjs
// اختبار متصفح حقيقي للواجهة (خطوة بخطوة). يتخطى بهدوء إذا Playwright غير مثبت.
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
  let content;
  try { content = await readFile(file); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(content);
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;

const ctx = vm.createContext({});
for (const f of ['assets/data.js', 'assets/core.js']) vm.runInContext(await readFile(path.join(root, f), 'utf8'), ctx);
const Core = ctx.KhadraCore;
const expectedText = (state) => Core.shareText(Core.calculate({ ...Core.defaultState(), ...state }));

const browser = await chromium.launch();
let checks = 0;
const ok = (value, message) => { checks++; assert.ok(value, message); };

async function open(storage = {}, options = {}) {
  const { blockStorage, ...contextOptions } = options;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...contextOptions });
  // Google Fonts is external; tests must not depend on the network.
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '' }));
  if (blockStorage) {
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
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|visit|fonts|404/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__khadra);
  page.errors = errors;
  return page;
}
const app = (page) => page.evaluate(() => ({
  screen: window.__khadra.screen(), state: window.__khadra.getState(), favorites: window.__khadra.getFavorites(),
  recent: window.__khadra.getRecent(), text: window.__khadra.shareText(),
  stored: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))
}));
const onScreen = (page, name) => page.waitForFunction((n) => window.__khadra.screen() === n, name, { timeout: 3000 });
const tea = (page, label) => page.locator(`.tea[aria-label="${label}"]`);

try {
  // 1) أول زيارة: تبدأ من اختيار الشاي ولا يحفظ شيء.
  {
    const page = await open();
    let a = await app(page);
    ok(a.screen === 'tea' && await page.isVisible('#screenTea'), 'first visit starts at tea');
    ok(a.text === expectedText({}), 'default result');
    ok(!a.stored[Core.KEYS.selection] && !a.stored[Core.KEYS.recent], 'nothing saved on first load');
    ok((await page.locator('.tea').count()) === Core.CATALOG.length, 'all teas listed');
    ok(await page.locator('.tea[aria-pressed="true"]').count() === 1, 'one tea selected');

    // البحث ثم اختيار نوع فرعي: ينتقل للماء بدون ما يسجل خدرة.
    await page.fill('#teaSearch', 'الوزه');
    ok((await page.locator('.tea:visible').count()) === 2, 'search filters');
    await tea(page, 'الوزه — OP1').click();
    await onScreen(page, 'water');
    a = await app(page);
    ok(a.state.product === 'brand:wazah' && a.state.subtype === 'wazah-op1', 'picked subtype');
    ok(a.recent.length === 0, 'picking does not commit');
    ok(JSON.parse(a.stored[Core.KEYS.selection]).subtype === 'wazah-op1', 'selection saved');
    ok((await page.textContent('#waterFor')).includes('الوزه'), 'water screen names tea');

    // الماء: كمية مخصصة فاضية = خطأ والتالي معطل، والأرقام العربية مقبولة.
    await page.click('[data-water="custom"]');
    ok(await page.isDisabled('#nextBtn'), 'next disabled for empty custom water');
    await page.fill('#customWater', 'abc');
    ok((await page.textContent('#waterError')).includes('بين 1 و100000'), 'water error message');
    await page.fill('#customWater', '٧٨٠٫٥');
    ok((await page.textContent('#waterBig')) === '780.5', 'arabic digits');
    await page.click('#nextBtn');
    await onScreen(page, 'taste');
    ok((await page.locator('.taste[data-taste="medium"] .taste-sugar b').textContent()) ===
      Core.calculate({ ...Core.defaultState(), product: 'brand:wazah', subtype: 'wazah-op1', taste: 'medium', water: '780.5' }).sugarGrams, 'taste card shows sugar');

    // الذوق = الإجراء النهائي: يحسب ويسجل ويعرض الوصفة.
    await page.click('.taste[data-taste="medium"]');
    await onScreen(page, 'result');
    a = await app(page);
    const brewState = { product: 'brand:wazah', subtype: 'wazah-op1', taste: 'medium', water: '780.5', waterMode: 'custom' };
    ok(a.text === expectedText(brewState), 'result text');
    ok(a.recent.length === 1, 'final step commits');
    ok((await page.textContent('#teaGrams')) === Core.calculate({ ...Core.defaultState(), ...brewState }).teaGrams, 'tea grams shown');
    ok(await page.isHidden('#actionbar'), 'no action bar on result');

    // تعديل الذوق من الوصفة: يرجع للوصفة مباشرة، ونفس الخدرة لا تتكرر.
    await page.click('[data-edit="taste"]');
    await onScreen(page, 'taste');
    await page.click('.taste[data-taste="medium"]');
    await onScreen(page, 'result');
    ok((await app(page)).recent.length === 1, 'same brew not duplicated');
    await page.click('[data-edit="water"]');
    await page.click('[data-water="1000"]');
    await onScreen(page, 'result');
    ok((await app(page)).recent.length === 2, 'edited water returns to result and commits');

    // المفضلة.
    await page.click('#favoriteToggle');
    a = await app(page);
    ok(a.favorites.length === 1 && JSON.parse(a.stored[Core.KEYS.favorites]).items[0].subtype === 'wazah-op1', 'favorite saved');
    ok((await page.getAttribute('#favoriteToggle', 'aria-pressed')) === 'true', 'favorite pressed');
    ok((await page.textContent('#favoritesCount')) === '1', 'favorites badge');

    // الوزنة الخاصة: صفر سكر = بدون سكر، والمدة نص وليست HTML، ولا يوجد خطوة ذوق.
    await page.click('#newBrew');
    await onScreen(page, 'tea');
    await page.click('#modeManual');
    ok(await page.isDisabled('#nextBtn'), 'manual next disabled until valid');
    await page.fill('#manualTea', '12.55');
    await page.fill('#manualSugar', '0');
    await page.fill('#manualSteep', '<img src=x onerror="window.__xss=1">');
    ok(await page.isHidden('#stepTasteItem'), 'no taste step in manual');
    await page.click('#nextBtn');
    await onScreen(page, 'water');
    ok((await page.textContent('#nextLabel')) === 'احسب الخدرة', 'manual water is final step');
    await page.click('#nextBtn');
    await onScreen(page, 'result');
    a = await app(page);
    ok((await page.textContent('#sugarGrams')) === 'بدون سكر', 'manual zero sugar');
    ok(!(await page.evaluate(() => window.__xss)) && (await page.locator('img[src="x"]').count()) === 0, 'steep text is not HTML');
    ok(await page.isHidden('#favoriteToggle'), 'no favorite in manual mode');
    ok(a.recent.length === 2, 'markup in steep text is never saved to history');
    await page.click('[data-edit="tea"]');
    await onScreen(page, 'tea');
    await page.fill('#manualSteep', '20-25 دقيقة');
    ok((await page.textContent('#nextLabel')) === 'الوصفة', 'editing returns to recipe');
    await page.click('#nextBtn');
    await onScreen(page, 'result');
    a = await app(page);
    ok(a.recent[0].mode === 'manual' && a.recent[0].sugarPerLiter === '0' && a.recent[0].steepMinutes === '20-25 دقيقة', 'manual committed');

    // صفحة المفضلة: الاختيار يفتح الوصفة بنفس الماء والذوق.
    await page.click('#navFavorites');
    await onScreen(page, 'favorites');
    await page.click('.fav-pick');
    await onScreen(page, 'result');
    a = await app(page);
    ok(a.state.mode === 'tea' && a.state.subtype === 'wazah-op1' && a.state.taste === 'medium' && a.state.water === '1000', 'favorite keeps taste/water');
    ok(a.recent.length === 3 && a.recent[0].mode === 'tea' && a.recent[0].waterMl === '1000', 'favorite select commits (moves identical brew to top)');

    // آخر الخدرات: إعادة خدرة قديمة تنقلها للأعلى بدون تكرار.
    await page.click('#navRecent');
    await onScreen(page, 'recent');
    ok((await page.locator('.recent-btn').count()) === 3, 'recent list');
    await page.locator('.recent-btn').last().click();
    await onScreen(page, 'result');
    a = await app(page);
    ok(a.recent.length === 3 && Core.normalizeDigits(a.recent[0].waterMl) === '780.5', 'replay moves to top');

    // المسح يحتاج تأكيد.
    await page.click('#navRecent');
    await page.click('#clearRecent');
    ok((await app(page)).recent.length === 3, 'clear needs confirmation');
    await page.click('#clearYes');
    a = await app(page);
    ok(a.recent.length === 0 && JSON.parse(a.stored[Core.KEYS.recent]).items.length === 0 && await page.isVisible('#recentEmpty'), 'cleared');

    // زر الرجوع في المتصفح يرجع خطوة.
    await page.click('#recentView .back-link');
    await onScreen(page, 'tea');
    await page.goBack();
    await onScreen(page, 'recent');
    ok(true, 'browser back works');

    // الزائر الراجع يشوف وصفته الأخيرة مباشرة بدون ما تنضاف للسجل.
    await page.evaluate(() => { location.hash = ''; });
    const before = (await app(page)).text;
    await page.reload();
    a = await app(page);
    ok(a.screen === 'result' && a.text === before && a.recent.length === 0 && a.favorites.length === 1, 'returning visitor sees last recipe');
    ok(page.errors.length === 0, 'no console errors: ' + page.errors.join(' | '));
    await page.context().close();
  }

  // 2) بيانات محفوظة بصيغة النسخة السابقة.
  {
    const legacy = {
      [Core.KEYS.selection]: JSON.stringify({ version: 1, mode: 'tea', product: 'brand:munais', subtype: 'munais-bop1', taste: 'nosugar', waterMl: '780.5', waterMode: 'custom', manual: null }),
      [Core.KEYS.favorites]: JSON.stringify({ version: 1, items: [{ product: 'simple:khabt-bop1', subtype: null }, { product: 'simple:removed', subtype: null }] }),
      [Core.KEYS.recent]: JSON.stringify({ version: 1, items: [{ mode: 'manual', teaPerLiter: '12', sugarPerLiter: '50', steepMinutes: '', waterMl: '500', waterMode: 'preset' }, { bad: true }] })
    };
    const page = await open(legacy);
    const a = await app(page);
    ok(a.screen === 'result' && a.text === expectedText({ product: 'brand:munais', subtype: 'munais-bop1', taste: 'nosugar', water: '780.5', waterMode: 'custom' }), 'legacy selection');
    ok(a.favorites.length === 1 && a.recent.length === 1, 'legacy collections filtered');
    await page.click('.step-pill[data-go="tea"]');
    ok(await page.isVisible('#favsRow'), 'favorites row shown');
    await page.click('.fav-chip');
    await onScreen(page, 'result');
    ok((await app(page)).state.product === 'simple:khabt-bop1', 'favorite chip opens recipe');
    await page.context().close();
  }

  // 3) التخزين محجوب: الحاسبة تشتغل وتنبه.
  {
    const page = await open({}, { blockStorage: true });
    await page.locator('.tea').first().click();
    await onScreen(page, 'water');
    await page.click('[data-water="500"]');
    await onScreen(page, 'taste');
    await page.click('.taste[data-taste="normal"]');
    await onScreen(page, 'result');
    ok((await page.textContent('#teaGrams')) === '6', 'works without storage');
    ok((await page.textContent('#storageNotice')).includes('تعذر الحفظ'), 'storage failure notice');
    await page.context().close();
  }

  // 4) النسخ والواتساب بنفس النص.
  {
    const page = await open({}, { permissions: ['clipboard-read', 'clipboard-write'] });
    await page.evaluate(() => { location.hash = 'result'; });
    await onScreen(page, 'result');
    await page.click('#copyBtn');
    await page.waitForFunction(() => document.querySelector('#copyBtn span').textContent.includes('✓'));
    ok((await page.evaluate(() => navigator.clipboard.readText())) === expectedText({}), 'clipboard text');
    const href = await page.getAttribute('#whatsappBtn', 'href');
    ok(decodeURIComponent(href.split('?text=')[1]) === expectedText({}), 'whatsapp text');
    await page.context().close();
  }

  // 5) لا يوجد تمرير أفقي في أي شاشة أو مقاس.
  for (const width of [320, 390, 768, 1024, 1366]) {
    const page = await open({}, { viewport: { width, height: 900 } });
    for (const name of ['tea', 'water', 'taste', 'result', 'favorites', 'recent']) {
      await page.evaluate((n) => { location.hash = n; }, name);
      await onScreen(page, name);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      ok(overflow <= 0, `overflow ${overflow}px at ${width} ${name}`);
    }
    await page.evaluate(() => { location.hash = 'tea'; });
    await page.click('#modeManual');
    ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, `manual overflow at ${width}`);
    await page.context().close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log({ uiChecks: checks, failures: 0 });
