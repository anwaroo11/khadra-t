/* واجهة خدرة شاي — خطوة بخطوة: الشاي ← الماء ← الذوق ← الوصفة.
 * كل الحسابات والتحقق وصيغ الحفظ في core.js؛ هذا الملف يعرض الحالة ويتنقل بين الشاشات فقط. */
(function () {
  'use strict';

  const C = window.KhadraCore;
  const $ = (id) => document.getElementById(id);
  const STORAGE_ERROR = 'تعذر الحفظ على الجهاز؛ التغييرات متاحة خلال هذه الجلسة فقط.';
  const STEPS = ['tea', 'water', 'taste', 'result'];
  const PAGES = ['favorites', 'recent'];
  const DIAL_SCALE = 60; // وجه الساعة: 60 دقيقة
  const DIAL_C = 2 * Math.PI * 46;

  /* ---------- التخزين (لا يكسر الحاسبة إذا كان محجوباً) ---------- */
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
  };

  const restored = C.restoreSelection(storage.get(C.KEYS.selection));
  let state = restored || C.defaultState();
  let favorites = C.loadFavorites(C.parseCollection(storage.get(C.KEYS.favorites)));
  let recent = C.loadRecent(C.parseCollection(storage.get(C.KEYS.recent)));
  let result = C.calculate(state);
  let screen = null;
  let editing = false;  // جاي من الوصفة يعدّل خطوة: بعد الاختيار يرجع للوصفة مباشرة
  let ready = false;    // لا نحفظ "آخر اختيار" أثناء فتح الصفحة
  // المستخدم الراجع يشوف وصفته الأخيرة مباشرة؛ الجديد يبدأ من اختيار الشاي.
  const homeScreen = restored ? 'result' : 'tea';

  function writeCollection(key, items) {
    const ok = storage.set(key, C.packCollection(items));
    $('storageNotice').textContent = ok ? '' : STORAGE_ERROR;
  }

  /* ---------- أدوات صغيرة ---------- */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    children.flat().forEach((child) => child != null && node.append(child));
    return node;
  }

  function icon(name, extraClass) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon' + (extraClass ? ' ' + extraClass : ''));
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.append(use);
    return svg;
  }

  // kind: 'teas' = بطاقة بالخلفية الموحدة، 'tins' = العلبة مقصوصة. احتياط: الصورة الأصلية ثم أيقونة.
  function teaImage(item, kind, eager) {
    const img = el('img', {
      src: 'img/' + kind + '/' + item.image, alt: '', decoding: 'async', loading: eager ? 'eager' : 'lazy'
    });
    img.addEventListener('error', () => {
      if (!img.dataset.retried) { img.dataset.retried = '1'; img.src = item.image; return; }
      img.replaceWith(icon('glass'));
    });
    return img;
  }

  const currentItem = () => C.findItem(state.product, state.subtype);
  const isFavorite = (item) => favorites.some((f) => C.sameIdentity(f, C.identityOf(item)));
  const setChecked = (node, on) => node.setAttribute('aria-checked', String(Boolean(on)));
  const isManual = () => state.mode === 'manual';
  const manualValid = () => C.validAmountText(state.manual.tea, C.LIMITS.tea) !== null &&
    C.validAmountText(state.manual.sugar, C.LIMITS.sugar) !== null;
  const waterValid = () => C.validAmountText(state.water, C.LIMITS.water) !== null;

  let toastTimer;
  function toast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-shown'), 2200);
  }

  /* ---------- الرسم ---------- */
  function render() {
    result = C.calculate(state);
    renderTea();
    renderWater();
    renderTastes();
    renderResult();
    renderBar();
    if (ready && result.ok) storage.set(C.KEYS.selection, JSON.stringify(C.serializeSelection(state)));
  }

  function syncInput(input, value) {
    if (input.value !== value) input.value = value;
  }

  function markInvalid(input, raw, limits) {
    const bad = String(raw).trim() !== '' && C.validAmountText(raw, limits) === null;
    input.closest('.input').classList.toggle('is-invalid', bad);
    input.setAttribute('aria-invalid', String(bad));
    return bad;
  }

  /* ١ الشاي */
  const teaCards = new Map();
  function buildTeaGrid() {
    const grid = $('teaGrid');
    C.CATALOG.forEach((item) => {
      const card = el('button', {
        type: 'button', class: 'tea', 'aria-pressed': 'false',
        'aria-label': item.label,
        onclick: () => pickTea(item)
      },
      el('span', { class: 'tea-art' }, teaImage(item, 'teas'), el('span', { class: 'tea-tick' }, icon('check'))),
      el('b', { text: item.brand }),
      el('small', { text: item.teaType || ' ' }));
      teaCards.set(item, card);
      grid.append(card);
    });
    filterTeaGrid();
  }

  function filterTeaGrid() {
    const query = $('teaSearch').value;
    const matched = C.searchCatalog(query);
    const grid = $('teaGrid');
    teaCards.forEach((card) => { card.hidden = true; });
    matched.forEach((item) => { const card = teaCards.get(item); card.hidden = false; grid.append(card); });
    $('teaEmpty').hidden = matched.length > 0;
    $('clearSearch').hidden = !query;
  }

  let favsKey = '';
  function renderTea() {
    const manual = isManual();
    setChecked($('modeTea'), !manual);
    setChecked($('modeManual'), manual);
    $('teaPick').hidden = manual;
    $('manualPick').hidden = !manual;
    $('qTea').textContent = manual ? 'وش وزنتك؟' : 'وش شايك اليوم؟';
    $('stepTeaLabel').textContent = manual ? 'الوزنة' : 'الشاي';

    const item = currentItem();
    teaCards.forEach((card, it) => card.setAttribute('aria-pressed',
      String(!manual && it.value === item.value && it.typeId === item.typeId)));

    const key = JSON.stringify(favorites) + '|' + item.value + '|' + item.typeId + '|' + manual;
    if (key !== favsKey) {
      favsKey = key;
      const row = $('favsScroll');
      row.textContent = '';
      favorites.forEach((identity) => {
        const fav = C.resolveSaved(identity);
        if (!fav) return;
        row.append(el('button', {
          type: 'button', class: 'fav-chip',
          'aria-pressed': String(!manual && C.sameIdentity(identity, C.identityOf(item))),
          onclick: () => selectFavorite(identity)
        }, teaImage(fav, 'teas'), el('span', { text: fav.brand }), fav.teaType ? el('small', { text: fav.teaType }) : null));
      });
    }
    $('favsRow').hidden = !favorites.length;

    syncInput($('manualTea'), state.manual.tea);
    syncInput($('manualSugar'), state.manual.sugar);
    syncInput($('manualSteep'), state.manual.steep);
    markInvalid($('manualTea'), state.manual.tea, C.LIMITS.tea);
    markInvalid($('manualSugar'), state.manual.sugar, C.LIMITS.sugar);
  }

  /* ٢ الماء */
  function renderWater() {
    const custom = state.waterMode === 'custom';
    document.querySelectorAll('[data-water]').forEach((b) => {
      const value = b.dataset.water;
      setChecked(b, value === 'custom' ? custom : !custom && Number(state.water) === Number(value));
    });
    $('customWaterField').hidden = !custom;
    syncInput($('customWater'), custom ? state.water : '');
    const bad = markInvalid($('customWater'), custom ? state.water : '', C.LIMITS.water);

    const valid = waterValid();
    $('waterBig').textContent = valid ? C.normalizeDigits(state.water) : '—';
    const error = $('waterError');
    error.hidden = !bad;
    if (bad) error.textContent = C.calculate({ ...state, mode: 'tea' }).message;

    const cups = $('waterCups');
    cups.textContent = '';
    if (valid) {
      const text = C.roundedProductText(C.normalizeDigits(state.water), 1, C.CUP_ML);
      const count = Number(text);
      const whole = Math.floor(count);
      for (let i = 0; i < Math.min(whole, 12); i++) cups.append(icon('glass'));
      if (whole < 12 && count - whole >= 0.05) cups.append(icon('glass', 'is-part'));
      if (whole > 12) cups.append(el('span', { text: '+' + (whole - 12) }));
      cups.append(el('span', { class: 'cups-note', text: 'تكفي تقريباً ' + text + ' بيالات' }));
    }
    const item = currentItem();
    $('waterFor').textContent = isManual() ? 'للوزنة اللي كتبتها' : 'لشاي ' + item.brand + (item.teaType ? ' ' + item.teaType : '');
  }

  /* ٣ الذوق */
  function buildTastes() {
    const box = $('tastes');
    const cubes = { normal: 2, medium: 3, nosugar: 0 };
    C.TASTES.forEach((taste) => {
      const cubeRow = el('span', { class: 'taste-cubes', 'aria-hidden': 'true' });
      if (!cubes[taste.value]) cubeRow.append(el('i', { class: 'none' }));
      for (let i = 0; i < cubes[taste.value]; i++) cubeRow.append(el('i'));
      box.append(el('button', {
        type: 'button', role: 'radio', class: 'taste', 'data-taste': taste.value,
        onclick: () => { state = { ...state, taste: taste.value }; render(); setTimeout(finish, 160); }
      }, el('span', { class: 'taste-name', text: taste.label }), cubeRow, el('span', { class: 'taste-sugar' })));
    });
  }

  function renderTastes() {
    document.querySelectorAll('.taste').forEach((button) => {
      const taste = button.dataset.taste;
      setChecked(button, taste === state.taste);
      const brew = C.calculate({ ...state, mode: 'tea', taste });
      const line = button.querySelector('.taste-sugar');
      line.textContent = '';
      if (!brew.ok) { line.textContent = '—'; return; }
      if (brew.sugarGrams === null) line.append('بدون سكر · شاي ', el('b', { text: brew.teaGrams }), ' جم');
      else line.append('سكر ', el('b', { text: brew.sugarGrams }), ' جم');
    });
  }

  /* الوصفة */
  let heroKey = '';
  function renderResult() {
    const manual = isManual();
    const item = manual ? null : currentItem();

    const key = manual ? 'manual' : item.value + '|' + item.typeId;
    if (key !== heroKey) {
      heroKey = key;
      const hero = $('heroTin');
      hero.textContent = '';
      hero.append(manual ? icon('scale') : teaImage(item, 'tins', true));
    }
    $('resultName').textContent = manual ? 'وزنتك الخاصة' : item.brand;

    const tags = $('resultTags');
    tags.textContent = '';
    if (manual) tags.append(el('span', { class: 'tag', text: 'وزنة مخصصة' }));
    else {
      if (item.teaType) tags.append(el('span', { class: 'tag tag-gold', text: item.teaType }));
      tags.append(el('span', { class: 'tag', text: C.tasteLabel(state.taste) }));
    }
    if (result.ok) tags.append(el('span', { class: 'tag', text: result.waterText + ' مل' }));

    const fav = $('favoriteToggle');
    fav.hidden = manual;
    if (item) {
      const on = isFavorite(item);
      fav.setAttribute('aria-pressed', String(on));
      fav.setAttribute('aria-label', on ? 'إزالة ' + item.label + ' من المفضلة' : 'إضافة ' + item.label + ' إلى المفضلة');
    }
    $('editTaste').hidden = manual;
    $('editTea').textContent = manual ? 'الوزنة' : 'الشاي';

    $('recipeOk').hidden = !result.ok;
    $('recipeError').hidden = result.ok;
    if (!result.ok) {
      $('recipeErrorText').textContent = result.message;
      $('whatsappBtn').removeAttribute('href');
      return;
    }
    $('teaGrams').textContent = result.teaGrams;
    const noSugar = result.sugarGrams === null;
    $('sugarGrams').textContent = noSugar ? 'بدون سكر' : result.sugarGrams;
    $('sugarUnit').hidden = noSugar;
    $('sugarDd').classList.toggle('is-text', noSugar);
    $('steepText').textContent = result.steepText;
    $('cupsValue').textContent = result.cups;
    renderDial(result.tea.steepMinutes);
    $('whatsappBtn').href = 'https://wa.me/?text=' + encodeURIComponent(C.shareText(result));
  }

  function buildDial() {
    const ticks = $('dialTicks');
    for (let m = 0; m < DIAL_SCALE; m += 5) {
      const a = (m / DIAL_SCALE) * 2 * Math.PI;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'dial-tick');
      line.setAttribute('x1', String(60 + 33 * Math.sin(a)));
      line.setAttribute('y1', String(60 - 33 * Math.cos(a)));
      line.setAttribute('x2', String(60 + 37 * Math.sin(a)));
      line.setAttribute('y2', String(60 - 37 * Math.cos(a)));
      ticks.append(line);
    }
  }

  // قوس ذهبي على وجه ساعة من بداية مدة الخدرة لنهايتها.
  function renderDial(range) {
    const dial = $('dial');
    const valid = range && typeof range === 'object' && Number.isFinite(range.min) && Number.isFinite(range.max);
    dial.hidden = !valid;
    if (!valid) return;
    const start = (Math.min(range.min, DIAL_SCALE) / DIAL_SCALE) * DIAL_C;
    const length = Math.max(4, ((Math.min(range.max, DIAL_SCALE) - Math.min(range.min, DIAL_SCALE)) / DIAL_SCALE) * DIAL_C);
    const arc = $('dialArc');
    arc.style.strokeDasharray = length + ' ' + DIAL_C;
    arc.style.strokeDashoffset = String(-start);
    $('dialLead').style.strokeDasharray = Math.max(0.01, start) + ' ' + DIAL_C;
  }

  /* شريط الخطوات والتنقل */
  function renderBar() {
    const manual = isManual();
    $('stepTasteItem').hidden = manual;
    const order = manual ? ['tea', 'water', 'result'] : STEPS;
    const index = order.indexOf(screen);
    document.querySelectorAll('.step-pill').forEach((pill) => {
      const i = order.indexOf(pill.dataset.go);
      pill.setAttribute('aria-current', pill.dataset.go === screen ? 'step' : 'false');
      pill.classList.toggle('is-done', i >= 0 && (i < index || editing));
    });
    const digits = ['١', '٢', '٣'];
    order.slice(0, -1).forEach((name, i) => {
      document.querySelector('.step-pill[data-go="' + name + '"] .step-n').textContent = digits[i];
    });

    const bar = $('actionbar');
    const onStep = ['tea', 'water', 'taste'].includes(screen);
    bar.hidden = !onStep;
    if (!onStep) return;
    $('backBtn').style.visibility = screen === 'tea' ? 'hidden' : 'visible';

    const sum = $('actionSum');
    sum.textContent = '';
    let canNext = true;
    let label = 'التالي';
    if (screen === 'tea') {
      if (manual) {
        canNext = manualValid();
        if (canNext) sum.append(el('b', { text: 'شاي ' + C.normalizeDigits(state.manual.tea) + ' · سكر ' + C.normalizeDigits(state.manual.sugar) }), el('span', { text: 'جم لكل لتر' }));
        else sum.append(el('span', { class: 'is-error', text: 'اكتب وزنة الشاي والسكر' }));
      } else {
        const item = currentItem();
        sum.append(el('b', { text: item.brand + (item.teaType ? ' ' + item.teaType : '') }), el('span', { text: 'اخترت' }));
      }
      if (editing) label = 'الوصفة';
    } else if (screen === 'water') {
      canNext = waterValid();
      if (canNext) sum.append(el('b', { text: C.normalizeDigits(state.water) + ' مل' }), el('span', { text: 'كمية الماء' }));
      else sum.append(el('span', { class: 'is-error', text: 'اكتب كمية الماء' }));
      if (manual) label = 'احسب الخدرة';
      else if (editing) label = 'الوصفة';
    } else {
      if (result.ok) sum.append(el('b', { text: result.teaGrams + ' جم شاي · ' + result.sugarText }), el('span', { text: C.tasteLabel(state.taste) }));
      label = 'احسب الخدرة';
    }
    $('nextBtn').disabled = !canNext;
    $('nextLabel').textContent = label;
  }

  /* ---------- الانتقال ---------- */
  function routeFromHash() {
    const name = location.hash.slice(1);
    if (STEPS.includes(name) || PAGES.includes(name)) return name;
    return homeScreen;
  }

  function applyRoute() {
    let name = routeFromHash();
    if (name === 'taste' && isManual()) name = 'water';
    const changed = name !== screen;
    screen = name;
    $('app').dataset.screen = name;
    $('wizard').hidden = PAGES.includes(name);
    $('favoritesView').hidden = name !== 'favorites';
    $('recentView').hidden = name !== 'recent';
    $('screenTea').hidden = name !== 'tea';
    $('screenWater').hidden = name !== 'water';
    $('screenTaste').hidden = name !== 'taste';
    $('screenResult').hidden = name !== 'result';
    $('navFavorites').setAttribute('aria-current', name === 'favorites' ? 'page' : 'false');
    $('navRecent').setAttribute('aria-current', name === 'recent' ? 'page' : 'false');
    if (name === 'favorites') renderFavorites();
    if (name === 'result') editing = false;
    renderBar();
    if (changed && ready) window.scrollTo(0, 0);
  }

  function go(name) {
    if (location.hash.slice(1) !== name) location.hash = name;
    applyRoute(); // hashchange يصل لاحقاً ويعيد نفس الشاشة بدون أثر
  }

  function nextStep() {
    if (screen === 'tea') {
      if (isManual() && !manualValid()) return;
      return editing ? finish() : go('water');
    }
    if (screen === 'water') {
      if (!waterValid()) { $('customWater').focus(); return; }
      return isManual() || editing ? finish() : go('taste');
    }
    if (screen === 'taste') finish();
  }

  function prevStep() {
    if (screen === 'water') go('tea');
    else if (screen === 'taste') go('water');
  }

  // الإجراء النهائي: يحسب، يحفظ في آخر الخدرات، ويعرض الوصفة.
  function finish() {
    render();
    if (result.ok && recordRecent()) toast('انحفظت في آخر الخدرات');
    go('result');
  }

  function pickTea(item) {
    state = C.withProduct({ ...state, mode: 'tea' }, item.value, item.typeId);
    render();
    setTimeout(() => (editing ? finish() : go('water')), 180);
  }

  /* ---------- المفضلة ---------- */
  function toggleCurrentFavorite() {
    if (isManual()) return;
    const item = currentItem();
    const was = isFavorite(item);
    favorites = C.toggleFavorite(favorites, C.identityOf(item));
    writeCollection(C.KEYS.favorites, favorites);
    renderFavorites();
    render();
    toast(was ? 'انشال من المفضلة' : 'انضاف للمفضلة');
  }

  function selectFavorite(identity) {
    const item = C.resolveSaved(identity);
    if (!item) return;
    state = C.withProduct({ ...state, mode: 'tea' }, item.value, item.typeId);
    finish();
  }

  function renderFavorites() {
    const list = $('favoriteList');
    list.textContent = '';
    favorites.forEach((identity) => {
      const item = C.resolveSaved(identity);
      if (!item) return;
      list.append(el('article', { class: 'fav-card' },
        el('button', { type: 'button', class: 'fav-pick', onclick: () => selectFavorite(identity) },
          el('span', { class: 'tea-art' }, teaImage(item, 'teas')),
          el('b', { text: item.brand }),
          el('small', { text: [item.teaType, C.minutesText(item.row.steepMinutes)].filter(Boolean).join(' · ') })),
        el('button', {
          type: 'button', class: 'fav-remove', 'aria-pressed': 'true',
          'aria-label': 'إزالة ' + item.label + ' من المفضلة',
          onclick: () => {
            favorites = favorites.filter((f) => !C.sameIdentity(f, identity));
            writeCollection(C.KEYS.favorites, favorites);
            renderFavorites();
            render();
          }
        }, icon('heart'))));
    });
    $('favoritesEmpty').hidden = list.children.length > 0;
    const count = $('favoritesCount');
    count.hidden = !favorites.length;
    count.textContent = String(favorites.length);
  }

  /* ---------- آخر الخدرات ---------- */
  function recordRecent() {
    const next = C.addRecent(recent, C.recentEntryFor(state));
    if (next === recent) return false;
    recent = next;
    writeCollection(C.KEYS.recent, recent);
    renderRecent();
    return true;
  }

  function restoreRecent(entry) {
    const next = C.stateFromRecent(state, entry);
    if (!next) return;
    state = next;
    finish();
  }

  function renderRecent() {
    const list = $('recentList');
    list.textContent = '';
    recent.forEach((entry) => {
      const item = entry.mode === 'tea' ? C.resolveSaved(entry) : null;
      const brew = C.calculate(C.stateFromRecent(C.defaultState(), entry));
      if (!brew.ok) return;
      const detail = item
        ? C.tasteLabel(entry.taste) + ' · ' + entry.waterMl + ' مل'
        : 'شاي ' + entry.teaPerLiter + ' · سكر ' + entry.sugarPerLiter + ' جم/لتر' +
          (entry.steepMinutes ? ' · ' + entry.steepMinutes : '') + ' · ' + entry.waterMl + ' مل';
      list.append(el('li', {}, el('button', { type: 'button', class: 'recent-btn', onclick: () => restoreRecent(entry) },
        item ? teaImage(item, 'teas') : el('span', { class: 'recent-icon' }, icon('scale')),
        el('span', { class: 'recent-main' }, el('b', { text: item ? item.label : 'وزنة خاصة' }), el('small', { text: detail })),
        el('span', { class: 'recent-out' },
          el('span', {}, el('b', { text: brew.teaGrams }), 'جم شاي'),
          brew.sugarGrams === null
            ? el('span', {}, el('b', { class: 'txt', text: 'بدون' }), 'سكر')
            : el('span', {}, el('b', { text: brew.sugarGrams }), 'جم سكر')))));
    });
    $('recentEmpty').hidden = recent.length > 0;
    $('clearRow').hidden = !recent.length;
    $('clearRecent').hidden = false;
    $('clearConfirm').hidden = true;
  }

  /* ---------- النسخ ---------- */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = el('textarea', { readonly: true });
      const previous = document.activeElement;
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      try {
        document.body.append(area);
        area.select();
        area.setSelectionRange(0, text.length);
        return document.execCommand('copy') === true;
      } catch {
        return false;
      } finally {
        area.remove();
        if (previous && previous.isConnected) previous.focus();
      }
    }
  }

  async function onCopy() {
    const button = $('copyBtn');
    const text = C.shareText(result);
    if (!text) return;
    button.disabled = true;
    const copied = await copyText(text);
    button.disabled = false;
    button.querySelector('span').textContent = copied ? 'تم النسخ ✓' : 'تعذر النسخ، حاول مرة ثانية';
    button.classList.toggle('is-done', copied);
    setTimeout(() => {
      button.querySelector('span').textContent = 'نسخ النتيجة';
      button.classList.remove('is-done');
    }, 1600);
  }

  /* ---------- الأحداث ---------- */
  function bind() {
    $('modeTea').addEventListener('click', () => { state = { ...state, mode: 'tea' }; render(); });
    $('modeManual').addEventListener('click', () => { state = { ...state, mode: 'manual' }; render(); });
    $('teaSearch').addEventListener('input', filterTeaGrid);
    $('clearSearch').addEventListener('click', () => { $('teaSearch').value = ''; filterTeaGrid(); $('teaSearch').focus(); });

    const manualField = (id, key) => $(id).addEventListener('input', (e) => {
      state = { ...state, manual: { ...state.manual, [key]: e.target.value } };
      render();
    });
    manualField('manualTea', 'tea');
    manualField('manualSugar', 'sugar');
    manualField('manualSteep', 'steep');

    document.querySelectorAll('[data-water]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.water === 'custom') {
        state = { ...state, waterMode: 'custom', water: '' };
        render();
        $('customWater').focus();
        return;
      }
      state = { ...state, waterMode: 'preset', water: b.dataset.water };
      render();
      setTimeout(nextStep, 180);
    }));
    $('customWater').addEventListener('input', (e) => { state = { ...state, water: e.target.value }; render(); });
    ['customWater', 'manualTea', 'manualSugar', 'manualSteep'].forEach((id) =>
      $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') nextStep(); }));

    $('nextBtn').addEventListener('click', nextStep);
    $('backBtn').addEventListener('click', prevStep);
    document.querySelectorAll('.step-pill').forEach((pill) => pill.addEventListener('click', () => {
      if (screen === 'result' && pill.dataset.go !== 'result') editing = true;
      go(pill.dataset.go);
    }));
    document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      editing = true;
      go(b.dataset.edit);
    }));
    $('newBrew').addEventListener('click', () => {
      editing = false;
      $('teaSearch').value = '';
      filterTeaGrid();
      go('tea');
    });

    $('favoriteToggle').addEventListener('click', toggleCurrentFavorite);
    $('copyBtn').addEventListener('click', onCopy);
    $('whatsappBtn').addEventListener('click', (e) => { if (!result.ok) e.preventDefault(); });

    $('clearRecent').addEventListener('click', () => { $('clearRecent').hidden = true; $('clearConfirm').hidden = false; $('clearNo').focus(); });
    $('clearNo').addEventListener('click', () => { $('clearRecent').hidden = false; $('clearConfirm').hidden = true; });
    $('clearYes').addEventListener('click', () => {
      recent = [];
      writeCollection(C.KEYS.recent, recent);
      renderRecent();
      toast('انمسح السجل');
    });

    window.addEventListener('hashchange', applyRoute);
  }

  /* ---------- البداية ---------- */
  buildTeaGrid();
  buildTastes();
  buildDial();
  bind();
  applyRoute();
  render();
  renderFavorites();
  renderRecent();
  ready = true;

  // واجهة صغيرة للاختبارات الآلية فقط.
  window.__khadra = {
    getState: () => state, getFavorites: () => favorites, getRecent: () => recent,
    shareText: () => C.shareText(result), screen: () => screen
  };
})();
