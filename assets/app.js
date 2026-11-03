/* واجهة خدرة شاي — تعرض الحالة وتحدثها. كل الحسابات والتحقق في core.js. */
(function () {
  'use strict';

  const C = window.KhadraCore;
  const $ = (id) => document.getElementById(id);
  const THEME_KEY = 'khadra-t:theme:v1';
  const STORAGE_ERROR = 'تعذر الحفظ على الجهاز؛ التغييرات متاحة خلال هذه الجلسة فقط.';
  const VIEWS = ['calculator', 'favorites', 'recent'];
  const phone = window.matchMedia('(max-width: 960px)');

  /* ---------- التخزين (لا يكسر الحاسبة إذا كان محجوباً) ---------- */
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
  };

  let state = C.restoreSelection(storage.get(C.KEYS.selection)) || C.defaultState();
  let favorites = C.loadFavorites(C.parseCollection(storage.get(C.KEYS.favorites)));
  let recent = C.loadRecent(C.parseCollection(storage.get(C.KEYS.recent)));
  let result = C.calculate(state);
  let ready = false; // لا نحفظ "آخر اختيار" أثناء فتح الصفحة

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

  // صورة مصغرة خفيفة، ثم الصورة الأصلية، ثم أيقونة إذا تعذر التحميل.
  function fillThumb(holder, item, fallback, eager) {
    const src = item && item.image ? item.image : '';
    if (holder.dataset.src === src && holder.firstChild) return;
    holder.dataset.src = src;
    holder.textContent = '';
    if (!src) { holder.append(icon(fallback || 'leaf')); return; }
    const img = el('img', {
      src: 'thumbs/' + src, alt: '', width: 180, height: 180,
      decoding: 'async', loading: eager ? 'eager' : 'lazy'
    });
    img.addEventListener('error', () => {
      if (!img.dataset.retried) { img.dataset.retried = '1'; img.src = src; return; }
      img.replaceWith(icon(fallback || 'leaf'));
    });
    holder.append(img);
  }

  const currentItem = () => C.findItem(state.product, state.subtype);
  const isFavorite = (item) => favorites.some((f) => C.sameIdentity(f, C.identityOf(item)));
  const shortMinutes = (text) => String(text).replace(/\s*دقيقة$/, ' د');
  const setChecked = (node, on) => node.setAttribute('aria-checked', String(Boolean(on)));

  let toastTimer;
  function toast(message) {
    let node = document.querySelector('.toast');
    if (!node) { node = el('div', { class: 'toast', role: 'status' }); document.body.append(node); }
    node.textContent = message;
    node.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-shown'), 2200);
  }

  /* ---------- الرسم ---------- */
  function render() {
    result = C.calculate(state);
    renderControls();
    renderBrew();
    renderPeek();
    if (ready && result.ok) storage.set(C.KEYS.selection, JSON.stringify(C.serializeSelection(state)));
  }

  function syncInput(input, value) {
    if (input.value !== value) input.value = value;
  }

  function markInvalid(input, raw, limits) {
    const bad = String(raw).trim() !== '' && C.validAmountText(raw, limits) === null;
    input.closest('.input-wrap').classList.toggle('is-invalid', bad);
    input.setAttribute('aria-invalid', String(bad));
  }

  let subtypeKey = '';
  let quickKey = '';

  function renderControls() {
    const manual = state.mode === 'manual';
    setChecked($('modeTea'), !manual);
    setChecked($('modeManual'), manual);
    $('teaStep').hidden = manual;
    $('tasteStep').hidden = manual;
    $('manualStep').hidden = !manual;
    $('introText').textContent = manual
      ? 'أدخل وزنة الشاي والسكر لكل لتر، وحدد كمية الماء.'
      : 'اختر نوع الشاي وحدد كمية الماء، والمقادير تطلع لك مباشرة.';

    // الشاي المختار
    const item = currentItem();
    fillThumb($('pickedThumb'), item, 'leaf', true);
    $('pickedName').textContent = item.brand;
    $('pickedMeta').textContent = [item.teaType, item.realBrand !== item.brand ? item.realBrand : '']
      .filter(Boolean).join(' · ') || 'اضغط لاختيار نوع آخر';

    // أنواع الورق للبراند اللي له أكثر من نوع
    const subtypes = C.subtypesFor(state.product);
    const nextSubtypeKey = state.product + '|' + state.subtype;
    if (nextSubtypeKey !== subtypeKey) {
      subtypeKey = nextSubtypeKey;
      const box = $('subtypeChips');
      box.textContent = '';
      box.hidden = subtypes.length < 2;
      subtypes.forEach((sub) => box.append(el('button', {
        type: 'button', role: 'radio', class: 'chip', 'aria-checked': String(sub.typeId === state.subtype),
        text: sub.teaType,
        onclick: () => { state = C.withProduct(state, state.product, sub.typeId); render(); }
      })));
    }

    // اختصارات المفضلة
    const nextQuickKey = JSON.stringify(favorites) + '|' + item.value + '|' + item.typeId;
    if (nextQuickKey !== quickKey) {
      quickKey = nextQuickKey;
      const row = $('quickFavoritesRow');
      row.textContent = '';
      favorites.forEach((identity) => {
        const fav = C.resolveSaved(identity);
        if (!fav) return;
        const thumb = el('span', { class: 'thumb' });
        fillThumb(thumb, fav);
        row.append(el('button', {
          type: 'button', class: 'quick-chip',
          'aria-current': String(C.sameIdentity(identity, C.identityOf(item))),
          onclick: () => selectFavorite(identity)
        }, thumb, el('span', { text: fav.brand }), fav.teaType ? el('small', { text: fav.teaType }) : null));
      });
    }
    $('quickFavorites').hidden = !favorites.length;

    // الماء
    const custom = state.waterMode === 'custom';
    document.querySelectorAll('[data-water]').forEach((chip) => {
      const value = chip.dataset.water;
      setChecked(chip, value === 'custom' ? custom : !custom && Number(state.water) === Number(value));
    });
    $('customWaterField').hidden = !custom;
    syncInput($('customWater'), custom ? state.water : '');
    markInvalid($('customWater'), custom ? state.water : '', C.LIMITS.water);

    // المذاق
    $('tasteSwitch').querySelectorAll('[data-taste]').forEach((b) => setChecked(b, b.dataset.taste === state.taste));

    // الوزنة اليدوية
    syncInput($('manualTea'), state.manual.tea);
    syncInput($('manualSugar'), state.manual.sugar);
    syncInput($('manualSteep'), state.manual.steep);
    markInvalid($('manualTea'), state.manual.tea, C.LIMITS.tea);
    markInvalid($('manualSugar'), state.manual.sugar, C.LIMITS.sugar);
  }

  function renderBrew() {
    const manual = state.mode === 'manual';
    const item = manual ? null : currentItem();
    const card = $('brewCard');

    const fav = $('favoriteToggle');
    fav.hidden = manual;
    if (item) {
      const on = isFavorite(item);
      fav.setAttribute('aria-pressed', String(on));
      fav.querySelector('span').textContent = on ? 'في المفضلة' : 'أضف للمفضلة';
      fav.setAttribute('aria-label', on ? 'إزالة ' + item.label + ' من المفضلة' : 'إضافة ' + item.label + ' إلى المفضلة');
    }

    fillThumb($('brewThumb'), item, manual ? 'scale' : 'leaf', true);
    $('brewName').textContent = manual ? 'وزنة يدوية' : item.brand;
    const tags = $('brewTags');
    tags.textContent = '';
    if (manual) tags.append(el('span', { class: 'tag', text: 'وزنة مخصصة' }));
    else {
      if (item.teaType) tags.append(el('span', { class: 'tag tag-gold', text: item.teaType }));
      tags.append(el('span', { class: 'tag', text: C.tasteLabel(state.taste) }));
    }
    if (result.ok) tags.append(el('span', { class: 'tag tabular', text: result.waterText + ' مل' }));

    card.classList.toggle('is-error', !result.ok);
    $('brewOk').hidden = !result.ok;
    $('brewError').hidden = result.ok;
    if (!result.ok) {
      $('brewErrorText').textContent = result.message;
      $('whatsappBtn').removeAttribute('href');
      return;
    }

    $('teaGrams').textContent = result.teaGrams;
    const noSugar = result.sugarGrams === null;
    $('sugarGrams').textContent = noSugar ? 'بدون سكر' : result.sugarGrams;
    $('sugarUnit').hidden = noSugar;
    $('sugarValue').classList.toggle('is-text', noSugar);

    $('steepText').textContent = result.steepText;
    renderRuler(result.tea.steepMinutes);
    renderCups(Number(result.cups), result.cups);

    $('whatsappBtn').href = 'https://wa.me/?text=' + encodeURIComponent(C.shareText(result));
  }

  // مسطرة مدة الخدرة: الخط يبدأ من اليمين (0 دقيقة) والمدى المحدد بالذهبي.
  function renderRuler(range) {
    const ruler = $('steepRuler');
    const valid = range && typeof range === 'object' && Number.isFinite(range.min) && Number.isFinite(range.max);
    ruler.hidden = !valid;
    if (!valid) return;
    const scale = Math.max(40, Math.ceil(range.max / 10) * 10);
    const band = $('steepBand');
    band.style.insetInlineStart = (range.min / scale) * 100 + '%';
    band.style.width = ((range.max - range.min) / scale) * 100 + '%';
    ruler.querySelector('.ruler-track').style.backgroundImage =
      'repeating-linear-gradient(to left, var(--brew-line) 0 1px, transparent 1px calc(100% / ' + (scale / 5) + '))';
    const labels = $('steepLabels');
    labels.textContent = '';
    for (let m = 0; m <= scale; m += 10) {
      const label = el('span', { text: String(m) });
      label.style.insetInlineStart = (m / scale) * 100 + '%';
      // الطرفان داخل حدود المسطرة، والباقي في المنتصف.
      if (m === 0) label.style.transform = 'none';
      if (m === scale) label.style.transform = 'translateX(100%)';
      labels.append(label);
    }
    labels.lastChild.textContent += ' د';
  }

  // البيالات: أيقونة لكل بيالة (حتى 12)، والجزء الناقص بأيقونة باهتة.
  function renderCups(count, text) {
    $('cupsValue').textContent = text;
    const row = $('cupsRow');
    row.textContent = '';
    const whole = Math.floor(count);
    const shown = Math.min(whole, 12);
    for (let i = 0; i < shown; i++) row.append(icon('glass'));
    if (whole < 12 && count - whole >= 0.05) row.append(icon('glass', 'is-part'));
    if (whole > 12) row.append(el('span', { class: 'cups-more', text: '+' + (whole - 12) }));
    row.hidden = count <= 0;
  }

  let brewVisible = true;
  function renderPeek() {
    const peek = $('peek');
    const onCalc = document.getElementById('app').dataset.view === 'calculator';
    peek.hidden = !onCalc || !result.ok;
    peek.classList.toggle('is-away', brewVisible);
    if (!result.ok) return;
    $('peekTea').textContent = result.teaGrams + ' جم';
    $('peekSugar').textContent = result.sugarGrams === null ? 'بدون' : result.sugarGrams + ' جم';
    $('peekSteep').textContent = shortMinutes(result.steepText);
  }

  /* ---------- المفضلة ---------- */
  function toggleCurrentFavorite() {
    if (state.mode !== 'tea') return;
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
    render();
    recordRecent();
    goTo('calculator');
  }

  function renderFavorites() {
    const list = $('favoriteList');
    list.textContent = '';
    favorites.forEach((identity) => {
      const item = C.resolveSaved(identity);
      if (!item) return;
      const thumb = el('span', { class: 'thumb' });
      fillThumb(thumb, item);
      const perLiter = item.row.teaPerLiterByTaste[state.taste];
      list.append(el('article', { class: 'fav-card' },
        el('button', { type: 'button', class: 'fav-pick', onclick: () => selectFavorite(identity) },
          thumb,
          el('span', {}, el('b', { text: item.brand }),
            el('small', { text: [item.teaType, item.realBrand !== item.brand ? item.realBrand : ''].filter(Boolean).join(' · ') || ' ' })),
          el('span', { class: 'fav-amounts' },
            el('span', {}, el('b', { text: perLiter + ' جم' }), ' / لتر'),
            el('span', {}, el('b', { text: shortMinutes(C.minutesText(item.row.steepMinutes)) })))),
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
    render();
    recordRecent();
    goTo('calculator');
  }

  function renderRecent() {
    const list = $('recentList');
    list.textContent = '';
    recent.forEach((entry) => {
      const item = entry.mode === 'tea' ? C.resolveSaved(entry) : null;
      const brew = C.calculate(C.stateFromRecent(C.defaultState(), entry));
      if (!brew.ok) return;
      const thumb = el('span', { class: 'thumb' });
      fillThumb(thumb, item, 'scale');
      const detail = item
        ? C.tasteLabel(entry.taste) + ' · ' + entry.waterMl + ' مل'
        : 'شاي ' + entry.teaPerLiter + ' جم/لتر · سكر ' + entry.sugarPerLiter + ' جم/لتر' +
          (entry.steepMinutes ? ' · ' + entry.steepMinutes : '') + ' · ' + entry.waterMl + ' مل';
      list.append(el('li', {}, el('button', { type: 'button', class: 'recent-btn', onclick: () => restoreRecent(entry) },
        thumb,
        el('span', { class: 'recent-main' }, el('b', { text: item ? item.label : 'وزنة يدوية' }), el('small', { text: detail })),
        el('span', { class: 'recent-out' },
          el('span', {}, el('b', { text: brew.teaGrams }), 'جم شاي'),
          brew.sugarGrams === null
            ? el('span', {}, el('b', { text: 'بدون سكر' }))
            : el('span', {}, el('b', { text: brew.sugarGrams }), 'جم سكر')))));
    });
    $('recentEmpty').hidden = recent.length > 0;
    $('clearBox').hidden = !recent.length;
    $('clearRecent').hidden = false;
    $('clearConfirm').hidden = true;
  }

  /* ---------- اختيار الشاي ---------- */
  function renderPicker() {
    const query = $('teaSearch').value;
    const items = C.searchCatalog(query);
    const grid = $('teaGrid');
    grid.textContent = '';
    const current = currentItem();
    items.forEach((item) => {
      const thumb = el('span', { class: 'thumb' });
      fillThumb(thumb, item);
      const selected = item.value === current.value && item.typeId === current.typeId;
      grid.append(el('button', {
        type: 'button', class: 'tea-card', 'aria-pressed': String(selected),
        onclick: () => {
          state = C.withProduct(state, item.value, item.typeId);
          $('teaDialog').close();
          render();
        }
      }, thumb, el('b', { text: item.brand }), el('small', { text: item.teaType || ' ' }),
      el('span', { class: 'tick' }, icon('check'))));
    });
    $('sheetEmpty').hidden = items.length > 0;
    $('clearSearch').hidden = !query;
    $('sheetCount').textContent = query ? items.length + ' نتيجة' : items.length + ' نوع شاي · الأكثر طلباً أولاً';
  }

  function openPicker() {
    const dialog = $('teaDialog');
    renderPicker();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const selected = dialog.querySelector('.tea-card[aria-pressed="true"]');
    if (window.matchMedia('(pointer: fine)').matches) $('teaSearch').focus();
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- النسخ والمشاركة ---------- */
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

  /* ---------- التنقل ---------- */
  function applyView() {
    const name = location.hash.slice(1);
    const view = VIEWS.includes(name) ? name : 'calculator';
    const app = $('app');
    const changed = app.dataset.view !== view;
    app.dataset.view = view;
    $('calculatorView').hidden = view !== 'calculator';
    $('favoritesView').hidden = view !== 'favorites';
    $('recentView').hidden = view !== 'recent';
    document.querySelectorAll('.nav-btn').forEach((b) =>
      b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'));
    if (view === 'favorites') renderFavorites();
    renderPeek();
    if (changed && ready) window.scrollTo(0, 0);
  }

  function goTo(view) {
    if (location.hash.slice(1) !== view && !(view === 'calculator' && !location.hash)) location.hash = view;
    applyView(); // hashchange يصل لاحقاً ويعيد نفس العرض بدون أثر
  }

  /* ---------- الوضع الليلي ---------- */
  function toggleTheme() {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    storage.set(THEME_KEY, next);
  }

  /* ---------- الأحداث ---------- */
  function bind() {
    $('modeTea').addEventListener('click', () => { state = { ...state, mode: 'tea' }; render(); });
    $('modeManual').addEventListener('click', () => { state = { ...state, mode: 'manual' }; render(); });

    document.querySelectorAll('[data-water]').forEach((chip) => chip.addEventListener('click', () => {
      if (chip.dataset.water === 'custom') {
        state = { ...state, waterMode: 'custom', water: '' };
        render();
        $('customWater').focus();
      } else {
        state = { ...state, waterMode: 'preset', water: chip.dataset.water };
        render();
      }
    }));
    $('customWater').addEventListener('input', (e) => { state = { ...state, water: e.target.value }; render(); });

    const switchBox = $('tasteSwitch');
    C.TASTES.forEach((taste) => switchBox.append(el('button', {
      type: 'button', role: 'radio', class: 'seg', 'data-taste': taste.value, text: taste.label,
      onclick: () => { state = { ...state, taste: taste.value }; render(); renderFavorites(); }
    })));

    const manualField = (id, key) => $(id).addEventListener('input', (e) => {
      state = { ...state, manual: { ...state.manual, [key]: e.target.value } };
      render();
    });
    manualField('manualTea', 'tea');
    manualField('manualSugar', 'sugar');
    manualField('manualSteep', 'steep');

    $('calcForm').addEventListener('submit', (e) => {
      e.preventDefault();
      render();
      if (!result.ok) {
        const invalid = document.querySelector('#calcForm [aria-invalid="true"]') ||
          (state.waterMode === 'custom' ? $('customWater') : null);
        if (invalid && !invalid.closest('[hidden]')) invalid.focus();
        $('brewCard').scrollIntoView({ behavior: 'smooth', block: phone.matches ? 'start' : 'nearest' });
        return;
      }
      const saved = recordRecent();
      toast(saved ? 'انحفظت في آخر الخدرات' : 'نفس آخر خدرة محفوظة');
      $('brewCard').scrollIntoView({ behavior: 'smooth', block: phone.matches ? 'start' : 'nearest' });
    });

    $('openPicker').addEventListener('click', openPicker);
    $('closePicker').addEventListener('click', () => $('teaDialog').close());
    $('teaDialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
    $('teaSearch').addEventListener('input', renderPicker);
    $('clearSearch').addEventListener('click', () => { $('teaSearch').value = ''; renderPicker(); $('teaSearch').focus(); });

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

    document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => goTo(b.dataset.view)));
    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => goTo(b.dataset.go)));
    window.addEventListener('hashchange', applyView);
    $('themeToggle').addEventListener('click', toggleTheme);
    $('peek').addEventListener('click', () => $('brewCard').scrollIntoView({ behavior: 'smooth', block: 'start' }));

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        brewVisible = entry.isIntersecting;
        renderPeek();
      }, { threshold: 0.2 }).observe($('brewCard'));
    }
  }

  /* ---------- البداية ---------- */
  bind();
  render();
  renderFavorites();
  renderRecent();
  applyView();
  ready = true;

  // واجهة صغيرة للاختبارات الآلية فقط.
  window.__khadra = { getState: () => state, getFavorites: () => favorites, getRecent: () => recent, shareText: () => C.shareText(result) };
})();
