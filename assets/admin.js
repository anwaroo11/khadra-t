/* لوحة تحكم خدرة شاي — إضافة وتعديل أنواع الشاي ووصفات الخدرة.
 * البيانات تمر بنفس قواعد catalog.js قبل الحفظ، والخادم يعيد فحصها. */
(function () {
  'use strict';

  const K = window.KhadraCatalog;
  const DEMO = Boolean(window.KHADRA_ADMIN_DEMO);
  const BASE = typeof window.KHADRA_ASSET_BASE === 'string' ? window.KHADRA_ASSET_BASE : '../';
  const $ = (id) => document.getElementById(id);
  const TASTE_FIELDS = [['normal', 'tNormal', 'sNormal'], ['medium', 'tMedium', 'sMedium'], ['nosugar', 'tNosugar', 'sNosugar']];

  let catalog = null;   // الكتالوج الحالي (فيه rev)
  let custom = false;   // هل فيه كتالوج محفوظ أو هذا الأصلي
  let editing = null;   // { isNew, where: { list, g, i } | null, item }
  let image = null;     // صورة جديدة مجهزة: { source, card, tin }

  /* ---------- أدوات ---------- */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    children.flat().forEach((c) => c != null && node.append(c));
    return node;
  }
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.append(use);
    return svg;
  }
  let toastTimer;
  function toast(message, isError) {
    const t = $('toast');
    t.textContent = message;
    t.classList.toggle('is-error', Boolean(isError));
    t.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-shown'), isError ? 4500 : 2600);
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const randomName = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

  /* ---------- الاتصال بالخادم (أو نسخة تجريبية في المتصفح) ---------- */
  const http = {
    async call(path, { method = 'GET', body, raw, type } = {}) {
      const res = await fetch('/api/admin/' + path, {
        method, credentials: 'same-origin',
        headers: { 'x-khadra-admin': '1', ...(raw ? { 'content-type': type } : body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: raw || (body !== undefined ? JSON.stringify(body) : undefined)
      });
      let data = null;
      try { data = await res.json(); } catch { /* 204 */ }
      return { status: res.status, data };
    },
    session: () => http.call('session'),
    login: (password) => http.call('login', { method: 'POST', body: { password } }),
    logout: () => http.call('logout', { method: 'POST' }),
    catalog: () => http.call('catalog'),
    save: (next, baseRev) => http.call('catalog', { method: 'PUT', body: { baseRev, catalog: next } }),
    upload: (kind, name, blob) => http.call('image/' + kind + '/' + name, { method: 'PUT', raw: blob, type: blob.type }),
    history: () => http.call('history'),
    restore: (key) => http.call('history/' + key + '/restore', { method: 'POST' }),
    imageSrc: (img, kind) => K.imageUrl(img, kind, BASE)
  };

  const demo = (() => {
    const KEY = 'khadra-admin-demo:v1';
    const blobs = new Map();
    let authed = false;
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
    const store = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };
    const state = () => load() || { catalog: null, history: [] };
    const ok = (data) => ({ status: 200, data });
    return {
      session: async () => ({ status: authed ? 200 : 401, data: null }),
      login: async (p) => { authed = Boolean(p); return { status: authed ? 204 : 401, data: authed ? null : { error: 'wrong-password' } }; },
      logout: async () => { authed = false; return { status: 204 }; },
      catalog: async () => { const s = state(); return ok({ catalog: s.catalog || K.fromBundled(window.KhadraData), custom: Boolean(s.catalog) }); },
      save: async (next, baseRev) => {
        const s = state();
        const current = s.catalog || K.fromBundled(window.KhadraData);
        if (baseRev !== current.rev) return { status: 409, data: { rev: current.rev } };
        const v = K.validate({ ...next, version: 1 });
        if (!v.ok) return { status: 422, data: { errors: v.errors } };
        s.history.unshift({ key: String(current.rev).padStart(8, '0'), rev: current.rev, updatedAt: current.updatedAt || '', count: count(current), catalog: current });
        s.history = s.history.slice(0, 15);
        s.catalog = { ...v.data, rev: current.rev + 1, updatedAt: new Date().toISOString() };
        store(s);
        return ok({ rev: s.catalog.rev });
      },
      upload: async (kind, name, blob) => { blobs.set(kind + '/' + name, URL.createObjectURL(blob)); return ok({ image: 'upload:' + name }); },
      history: async () => ok({ items: state().history.map(({ catalog: _c, ...meta }) => meta) }),
      restore: async (key) => {
        const s = state();
        const h = s.history.find((x) => x.key === key);
        if (!h) return { status: 404 };
        const current = s.catalog || K.fromBundled(window.KhadraData);
        return demo.save({ ...h.catalog }, current.rev);
      },
      imageSrc: (img, kind) => (img && img.startsWith('upload:') ? blobs.get(kind + '/' + img.slice(7)) || '' : K.imageUrl(img, kind, BASE))
    };
  })();

  const api = DEMO ? demo : http;

  /* ---------- العروض ---------- */
  const VIEWS = ['loadingView', 'setupView', 'loginView', 'listView', 'editView', 'historyView'];
  function show(view) {
    VIEWS.forEach((v) => { $(v).hidden = v !== view; });
    $('topActions').hidden = !['listView', 'editView', 'historyView'].includes(view);
    window.scrollTo(0, 0);
  }

  async function start() {
    $('demoNote').hidden = !DEMO;
    const res = await api.session().catch(() => ({ status: 0 }));
    if (res.status === 200) return openList();
    if (res.status === 503) return show('setupView');
    show('loginView');
    $('password').focus();
  }

  /* ---------- الدخول ---------- */
  async function onLogin(e) {
    e.preventDefault();
    const btn = $('loginBtn');
    btn.disabled = true;
    $('loginError').hidden = true;
    const res = await api.login($('password').value).catch(() => ({ status: 0 }));
    btn.disabled = false;
    if (res.status === 204 || res.status === 200) { $('password').value = ''; return openList(); }
    if (res.status === 503) return show('setupView');
    $('loginError').textContent = res.status === 401 ? 'كلمة المرور غلط.'
      : res.status === 429 ? 'محاولات كثيرة. انتظر دقيقة وجرّب مرة ثانية.'
      : 'تعذر الاتصال. تأكد من الإنترنت وجرّب مرة ثانية.';
    $('loginError').hidden = false;
  }

  /* ---------- القائمة ---------- */
  const count = (c) => c.simple.length + c.branded.reduce((n, g) => n + g.items.length, 0);

  function entries() {
    return [
      ...catalog.simple.map((item, i) => ({ item, where: { list: 'simple', i }, brand: item.brand })),
      ...catalog.branded.flatMap((g, gi) => g.items.map((item, i) => ({ item, where: { list: 'branded', g: gi, i }, brand: g.brand })))
    ];
  }

  async function openList() {
    show('loadingView');
    const res = await api.catalog().catch(() => ({ status: 0 }));
    if (res.status === 401) return show('loginView');
    if (res.status !== 200) { show('listView'); toast('تعذر تحميل الأنواع. حدّث الصفحة.', true); return; }
    catalog = res.data.catalog;
    custom = res.data.custom;
    renderList();
    show('listView');
  }

  function thumb(item) {
    const src = item.image ? api.imageSrc(item.image, 'teas') : '';
    if (!src) return el('span', { class: 'a-noimg' }, icon('glass'));
    const img = el('img', { src, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(el('span', { class: 'a-noimg' }, icon('glass'))), { once: true });
    return img;
  }

  function renderList() {
    const q = $('search').value.trim().toLowerCase();
    const list = $('teaList');
    list.textContent = '';
    const all = entries();
    const shown = all.filter(({ item, brand }) => !q || (item.cardName + ' ' + brand + ' ' + item.teaType).toLowerCase().includes(q));
    shown.forEach(({ item, where, brand }) => {
      const steep = item.steepMinutes.min === item.steepMinutes.max ? item.steepMinutes.min : item.steepMinutes.min + '–' + item.steepMinutes.max;
      list.append(el('button', { type: 'button', class: 'a-item', onclick: () => openEditor(where) },
        thumb(item),
        el('span', { class: 'a-item-main' },
          el('b', {}, item.featured ? icon('star') : null, item.featured ? ' ' : null, item.cardName),
          el('small', { text: [item.teaType, where.list === 'branded' ? 'براند ' + brand : '', steep + ' دقيقة'].filter(Boolean).join(' · ') })),
        el('span', { class: 'a-item-nums' },
          el('b', { text: String(item.teaPerLiterByTaste.normal) }), 'جم شاي')));
    });
    $('listEmpty').hidden = shown.length > 0;
    $('teaCount').textContent = '(' + all.length + ')';
    $('catalogStatus').textContent = custom
      ? 'آخر تعديل: ' + (catalog.updatedAt ? new Date(catalog.updatedAt).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
      : 'هذي القائمة الأصلية. أول حفظ يبدأ نسختك الخاصة.';
  }

  /* ---------- المحرر ---------- */
  function openEditor(where) {
    const isNew = !where;
    const item = isNew ? {
      id: K.newId('t'), cardName: '', brand: '', teaType: '', image: '',
      teaPerLiterByTaste: { normal: '', medium: '', nosugar: '' },
      sugarPerLiterByTaste: { normal: '', medium: '', nosugar: 0 },
      steepMinutes: { min: '', max: '' }
    } : clone(where.list === 'simple' ? catalog.simple[where.i] : catalog.branded[where.g].items[where.i]);
    editing = { isNew, where, item };
    image = null;

    $('editTitle').textContent = isNew ? 'شاي جديد' : 'تعديل ' + item.cardName;
    $('fName').value = item.cardName;
    $('fFullName').value = where && where.list === 'branded' ? '' : (item.brand || '');
    $('fType').value = item.teaType;
    $('fFeatured').checked = Boolean(item.featured);
    const group = $('fGroup');
    group.textContent = '';
    group.append(el('option', { value: '', text: 'بدون — نوع مستقل' }));
    catalog.branded.forEach((g) => group.append(el('option', { value: g.brandId, text: g.brand })));
    group.value = where && where.list === 'branded' ? catalog.branded[where.g].brandId : '';
    TASTE_FIELDS.forEach(([t, tea, sugar]) => {
      $(tea).value = item.teaPerLiterByTaste[t];
      if (t !== 'nosugar') $(sugar).value = item.sugarPerLiterByTaste[t];
    });
    $('steepMin').value = item.steepMinutes.min;
    $('steepMax').value = item.steepMinutes.max;
    $('imageFile').value = '';
    $('bgControls').hidden = true;
    $('removeBg').checked = false;
    $('toleranceWrap').hidden = true;
    $('deleteBox').hidden = isNew;
    $('deleteBtn').hidden = false;
    $('deleteConfirm').hidden = true;
    $('formErrors').hidden = true;
    document.querySelectorAll('#teaForm .is-invalid').forEach((n) => n.classList.remove('is-invalid'));
    syncGroupUi();
    updatePreview();
    show('editView');
    if (isNew) $('fName').focus();
  }

  function syncGroupUi() {
    $('fullNameField').hidden = Boolean($('fGroup').value);
  }

  const num = (id) => {
    const raw = String($(id).value).trim()
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
      .replace(/[٫,]/g, '.');
    return raw === '' ? '' : Number(raw);
  };

  function draftItem() {
    const it = editing.item;
    const name = $('fName').value.trim();
    const out = {
      id: it.id,
      teaType: $('fType').value.trim(),
      cardName: name,
      image: it.image,
      teaPerLiterByTaste: {}, sugarPerLiterByTaste: {},
      steepMinutes: { min: num('steepMin'), max: num('steepMax') }
    };
    if (!$('fGroup').value) out.brand = $('fFullName').value.trim() || name;
    if ($('fFeatured').checked) out.featured = true;
    TASTE_FIELDS.forEach(([t, tea, sugar]) => {
      out.teaPerLiterByTaste[t] = num(tea);
      out.sugarPerLiterByTaste[t] = t === 'nosugar' ? 0 : num(sugar);
    });
    return out;
  }

  // يبني الكتالوج بعد التعديل: بنفس المكان إذا ما تغيّر البراند، وإلا ينقله لآخر القائمة الجديدة.
  function buildNext(item, remove) {
    const next = clone(catalog);
    const from = editing.where;
    const groupId = remove ? null : $('fGroup').value;
    const sameSpot = from && !remove && (from.list === 'simple' ? !groupId : next.branded[from.g].brandId === groupId);
    if (sameSpot) {
      if (from.list === 'simple') next.simple[from.i] = item;
      else next.branded[from.g].items[from.i] = item;
      return next;
    }
    if (from) {
      if (from.list === 'simple') next.simple.splice(from.i, 1);
      else next.branded[from.g].items.splice(from.i, 1);
    }
    if (!remove) {
      if (groupId) next.branded.find((g) => g.brandId === groupId).items.push(item);
      else next.simple.push(item);
    }
    next.branded = next.branded.filter((g) => g.items.length);
    return next;
  }

  function markFields(errors) {
    const map = [['الاسم', 'fName'], ['الاسم الكامل', 'fFullName'], ['نوع الورق', 'fType'],
      ['شاي (normal)', 'tNormal'], ['شاي (medium)', 'tMedium'], ['شاي (nosugar)', 'tNosugar'],
      ['سكر (normal)', 'sNormal'], ['سكر (medium)', 'sMedium'], ['مدة الخدرة (من)', 'steepMin'], ['مدة الخدرة (إلى)', 'steepMax'], ['بداية مدة الخدرة', 'steepMin']];
    document.querySelectorAll('#teaForm .is-invalid').forEach((n) => n.classList.remove('is-invalid'));
    map.forEach(([key, id]) => { if (errors.some((e) => e.includes(key))) $(id).classList.add('is-invalid'); });
  }

  function friendly(errors) {
    return errors.map((e) => e
      .replace(/^(النوع|البراند) \d+( \/ النوع \d+)? ?/, '')
      .replace('(normal)', '(مناسب)').replace('(medium)', '(متوسط)').replace('(nosugar)', '(بدون سكر)')
      .replace(/^: /, ''));
  }

  function showErrors(errors) {
    const box = $('formErrors');
    box.textContent = '';
    box.append(el('b', { text: 'صحّح هذي قبل الحفظ:' }), el('ul', {}, [...new Set(friendly(errors))].slice(0, 8).map((e) => el('li', { text: e }))));
    box.hidden = false;
    markFields(errors);
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function onSave(e) {
    e.preventDefault();
    const item = draftItem();
    let imageName = null;
    if (image) {
      imageName = randomName() + (image.card.type === 'image/webp' ? '.webp' : '.png');
      item.image = 'upload:' + imageName;
    }
    const next = buildNext(item, false);
    const v = K.validate(next);
    if (!v.ok) return showErrors(v.errors);
    $('formErrors').hidden = true;
    markFields([]);

    const btn = $('saveBtn');
    btn.disabled = true;
    btn.textContent = 'جاري الحفظ…';
    try {
      if (image) {
        for (const [kind, blob] of [['teas', image.card], ['tins', image.tin]]) {
          const up = await api.upload(kind, imageName, blob);
          if (up.status !== 200) throw new Error(up.status === 401 ? 'login' : 'upload');
        }
      }
      const res = await api.save(v.data, catalog.rev);
      if (res.status === 200) {
        toast(editing.isNew ? 'انضاف الشاي ✓ يظهر في الموقع خلال دقيقة' : 'انحفظ التعديل ✓ يظهر في الموقع خلال دقيقة');
        return openList();
      }
      if (res.status === 409) return toast('انعدلت القائمة من مكان ثاني. حدّث الصفحة وأعد التعديل.', true);
      if (res.status === 422) return showErrors(res.data.errors || []);
      throw new Error(res.status === 401 ? 'login' : 'save');
    } catch (err) {
      if (err.message === 'login') { toast('انتهت الجلسة. سجّل دخول مرة ثانية.', true); show('loginView'); return; }
      toast(err.message === 'upload' ? 'تعذر رفع الصورة. جرّب صورة أصغر.' : 'تعذر الحفظ. تأكد من الاتصال وجرّب مرة ثانية.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'حفظ';
    }
  }

  async function onDelete() {
    const next = buildNext(null, true);
    const v = K.validate(next);
    if (!v.ok) return toast(v.errors[0], true);
    const res = await api.save(v.data, catalog.rev).catch(() => ({ status: 0 }));
    if (res.status === 200) { toast('انحذف الشاي'); return openList(); }
    if (res.status === 409) return toast('انعدلت القائمة من مكان ثاني. حدّث الصفحة.', true);
    toast('تعذر الحذف. جرّب مرة ثانية.', true);
  }

  /* ---------- المعاينة ---------- */
  function updatePreview() {
    const item = draftItem();
    $('previewName').textContent = item.cardName || 'اسم الشاي';
    $('previewType').textContent = item.teaType || ' ';
    const card = $('previewCard');
    const tin = $('previewTin');
    card.textContent = '';
    tin.textContent = '';
    if (image) {
      card.append(el('img', { src: image.cardUrl, alt: '' }));
      tin.append(el('img', { src: image.tinUrl, alt: '' }));
    } else if (editing.item.image) {
      card.append(el('img', { src: api.imageSrc(editing.item.image, 'teas'), alt: '' }));
      tin.append(el('img', { src: api.imageSrc(editing.item.image, 'tins'), alt: '' }));
    } else {
      card.append(icon('image'));
      tin.append(el('span', { class: 'a-muted', text: 'ما فيه صورة بعد' }));
    }
    $('uploadLabel').textContent = image || editing.item.image ? 'غيّر الصورة' : 'اختر صورة العلبة';

    const t = item.teaPerLiterByTaste, s = item.sugarPerLiterByTaste, st = item.steepMinutes;
    const fine = (n) => n !== '' && Number.isFinite(n);
    const sample = $('sample');
    sample.textContent = '';
    if (fine(t.normal) && fine(s.normal) && fine(st.min) && fine(st.max)) {
      const half = (n) => String(Math.round(n * 5) / 10);
      sample.append('في الموقع لـ ', el('b', { text: '500 مل' }), ' بمذاق مناسب: شاي ', el('b', { text: half(t.normal) + ' جم' }),
        ' · سكر ', el('b', { text: half(s.normal) + ' جم' }), ' · خدرة ', el('b', { text: st.min === st.max ? st.min + ' دقيقة' : st.min + '–' + st.max + ' دقيقة' }));
    } else {
      sample.textContent = 'عبّ الوزنة ومدة الخدرة وبتشوف هنا كيف تطلع الوصفة.';
    }
  }

  /* ---------- تجهيز الصورة في المتصفح ---------- */
  async function loadSource(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      const scale = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // يشيل الخلفية اللي لونها قريب من لون أطراف الصورة، بدءاً من الأطراف فقط.
  function removeBackground(src, tolerance) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const px = data.data, w = c.width, h = c.height;
    let r = 0, g = 0, b = 0, n = 0;
    const sample = (x, y) => { const k = (y * w + x) * 4; if (px[k + 3] > 200) { r += px[k]; g += px[k + 1]; b += px[k + 2]; n++; } };
    for (let x = 0; x < w; x += 2) { sample(x, 0); sample(x, h - 1); }
    for (let y = 0; y < h; y += 2) { sample(0, y); sample(w - 1, y); }
    if (!n) return c;
    r /= n; g /= n; b /= n;
    const tol2 = tolerance * tolerance;
    const seen = new Uint8Array(w * h);
    const stack = [];
    const push = (x, y) => { const i = y * w + x; if (!seen[i]) { seen[i] = 1; stack.push(i); } };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const i = stack.pop();
      const k = i * 4;
      const dr = px[k] - r, dg = px[k + 1] - g, db = px[k + 2] - b;
      if (px[k + 3] > 12 && dr * dr + dg * dg + db * db > tol2) continue;
      px[k + 3] = 0;
      const x = i % w, y = (i - x) / w;
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    // حواف ناعمة: نص شفافية للبكسل الملاصق للخلفية المشالة.
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const k = (y * w + x) * 4;
      if (px[k + 3] && (!px[k - 1] || !px[k + 7] || !px[k - w * 4 + 3] || !px[k + w * 4 + 3])) px[k + 3] = Math.round(px[k + 3] * 0.55);
    }
    ctx.putImageData(data, 0, 0);
    return c;
  }

  function trim(src) {
    const ctx = src.getContext('2d');
    const { data, width: w, height: h } = ctx.getImageData(0, 0, src.width, src.height);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return src;
    const c = document.createElement('canvas');
    c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
    c.getContext('2d').drawImage(src, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  }

  function fit(src, maxW, maxH) {
    const s = Math.min(maxW / src.width, maxH / src.height, 4);
    return { w: Math.max(1, Math.round(src.width * s)), h: Math.max(1, Math.round(src.height * s)) };
  }

  function roundedPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // نفس الخلفية العنابية الموحدة لصور الموقع.
  function makeCard(tin) {
    const S = 560, R = S * 0.16;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    roundedPath(ctx, 0, 0, S, S, R);
    ctx.clip();
    const bg = ctx.createLinearGradient(0, 0, 0, S);
    bg.addColorStop(0, 'rgb(84,26,30)');
    bg.addColorStop(1, 'rgb(30,10,12)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);
    const glow = ctx.createRadialGradient(S / 2, S * 0.46, 0, S / 2, S * 0.46, S * 0.42);
    glow.addColorStop(0, 'rgba(150,110,50,.55)');
    glow.addColorStop(1, 'rgba(150,110,50,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, S, S);
    const vign = ctx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75);
    vign.addColorStop(0, 'rgba(0,0,0,0)');
    vign.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, S, S);
    const size = fit(tin, S * 0.7, S * 0.7);
    const floor = S * 0.87;
    ctx.save();
    ctx.translate(S / 2, floor);
    ctx.scale(1, 0.12);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, size.w * 0.58);
    shadow.addColorStop(0, 'rgba(0,0,0,.6)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, size.w * 0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tin, (S - size.w) / 2, floor - size.h, size.w, size.h);
    roundedPath(ctx, 3, 3, S - 6, S - 6, R - 3);
    ctx.strokeStyle = 'rgba(214,178,106,.27)';
    ctx.lineWidth = 2;
    ctx.stroke();
    return c;
  }

  function makeTin(tin) {
    const size = fit(tin, 440, 480);
    const c = document.createElement('canvas');
    c.width = size.w; c.height = size.h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tin, 0, 0, size.w, size.h);
    return c;
  }

  const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob((b) => {
    if (b && b.type === 'image/webp') return resolve(b);
    canvas.toBlob(resolve, 'image/png');
  }, 'image/webp', 0.86));

  async function buildImage() {
    if (!image) return;
    const base = $('removeBg').checked ? removeBackground(image.source, Number($('tolerance').value)) : image.source;
    const tinCanvas = trim(base);
    const [card, tin] = await Promise.all([toBlob(makeCard(tinCanvas)), toBlob(makeTin(tinCanvas))]);
    if (image.cardUrl) URL.revokeObjectURL(image.cardUrl);
    if (image.tinUrl) URL.revokeObjectURL(image.tinUrl);
    Object.assign(image, { card, tin, cardUrl: URL.createObjectURL(card), tinUrl: URL.createObjectURL(tin) });
    updatePreview();
    $('previewTin').dataset.build = String(Number($('previewTin').dataset.build || 0) + 1);
  }

  async function onFile() {
    const file = $('imageFile').files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast('اختر صورة PNG أو JPG أو WEBP.', true);
    if (file.size > 15 * 1024 * 1024) return toast('الصورة كبيرة مرة. اختر صورة أصغر من 15 ميجا.', true);
    try {
      image = { source: await loadSource(file) };
    } catch {
      return toast('تعذر فتح الصورة. جرّب صورة ثانية.', true);
    }
    // صور JPG ما فيها شفافية: نفعّل إزالة الخلفية تلقائياً.
    $('removeBg').checked = file.type === 'image/jpeg';
    $('toleranceWrap').hidden = !$('removeBg').checked;
    $('bgControls').hidden = false;
    await buildImage();
  }

  /* ---------- السجل ---------- */
  async function openHistory() {
    show('loadingView');
    const res = await api.history().catch(() => ({ status: 0 }));
    if (res.status === 401) return show('loginView');
    const list = $('historyList');
    list.textContent = '';
    const items = res.status === 200 ? res.data.items : [];
    items.forEach((h) => {
      const when = h.updatedAt ? new Date(h.updatedAt).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }) : 'القائمة الأصلية';
      const confirmBox = el('span', { class: 'a-confirm', hidden: true },
        el('span', { text: 'ترجع لهذي النسخة؟' }),
        el('button', { type: 'button', class: 'a-btn a-btn-gold', onclick: () => restore(h.key) }, 'نعم'),
        el('button', { type: 'button', class: 'a-btn a-btn-ghost', onclick: () => { confirmBox.hidden = true; trigger.hidden = false; } }, 'لا'));
      const trigger = el('button', { type: 'button', class: 'a-btn a-btn-line', onclick: () => { trigger.hidden = true; confirmBox.hidden = false; } }, 'استرجاع');
      list.append(el('li', {}, el('div', {}, el('b', { text: h.rev === 0 ? 'القائمة الأصلية' : 'النسخة ' + h.rev }), el('small', { text: when + ' · ' + h.count + ' نوع' })), trigger, confirmBox));
    });
    $('historyEmpty').hidden = items.length > 0;
    show('historyView');
  }

  async function restore(key) {
    const res = await api.restore(key).catch(() => ({ status: 0 }));
    if (res.status === 200) { toast('رجعت النسخة ✓'); return openList(); }
    toast('تعذر الاسترجاع. جرّب مرة ثانية.', true);
  }

  /* ---------- الأحداث ---------- */
  $('loginForm').addEventListener('submit', onLogin);
  $('logoutBtn').addEventListener('click', async () => { await api.logout().catch(() => {}); show('loginView'); });
  $('search').addEventListener('input', renderList);
  $('addTea').addEventListener('click', () => openEditor(null));
  $('backToList').addEventListener('click', () => { show('listView'); });
  $('cancelEdit').addEventListener('click', () => { show('listView'); });
  $('teaForm').addEventListener('submit', onSave);
  $('teaForm').addEventListener('input', (e) => { if (e.target.type !== 'file' && e.target.type !== 'range') updatePreview(); });
  $('fGroup').addEventListener('change', () => { syncGroupUi(); updatePreview(); });
  $('imageFile').addEventListener('change', onFile);
  $('removeBg').addEventListener('change', () => { $('toleranceWrap').hidden = !$('removeBg').checked; buildImage(); });
  let tolTimer;
  $('tolerance').addEventListener('input', () => {
    $('toleranceOut').textContent = $('tolerance').value;
    clearTimeout(tolTimer);
    tolTimer = setTimeout(buildImage, 120);
  });
  $('discardImage').addEventListener('click', () => { image = null; $('imageFile').value = ''; $('bgControls').hidden = true; updatePreview(); });
  $('deleteBtn').addEventListener('click', () => { $('deleteBtn').hidden = true; $('deleteConfirm').hidden = false; });
  $('deleteNo').addEventListener('click', () => { $('deleteBtn').hidden = false; $('deleteConfirm').hidden = true; });
  $('deleteYes').addEventListener('click', onDelete);
  $('openHistory').addEventListener('click', openHistory);
  $('historyBack').addEventListener('click', () => show('listView'));
  const types = $('teaTypes');
  K.TEA_TYPES.forEach((t) => types.append(el('option', { value: t })));

  start();
})();
