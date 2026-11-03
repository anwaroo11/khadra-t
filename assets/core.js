/*
 * منطق خدرة شاي — دوال نقية بدون أي اعتماد على الصفحة.
 * الحساب، التحقق من المدخلات، نص المشاركة، وصيغ التخزين المحلي
 * مطابقة للنسخة المعتمدة السابقة (نفس المفاتيح ونفس الصيغ) حتى تبقى
 * مفضلة المستخدمين وسجلهم كما هي بعد التحديث.
 */
(function (root) {
  'use strict';

  const { SIMPLE_TEAS, BRANDED_TEAS } = root.KhadraData;

  const CUP_ML = 100;
  const SHARE_URL = 'https://khadra-t.netlify.app/';
  const RECENT_LIMIT = 10;
  const PRESET_WATER = ['1000', '500'];

  const LIMITS = Object.freeze({
    water: { min: 1, max: 100000, label: 'كمية ماء بالمل' },
    tea: { min: 0.1, max: 1000, label: 'وزنة شاي لكل لتر' },
    sugar: { min: 0, max: 2000, label: 'وزنة سكر لكل لتر' }
  });

  const TASTES = Object.freeze([
    { value: 'normal', label: 'مناسب' },
    { value: 'medium', label: 'متوسط' },
    { value: 'nosugar', label: 'بدون سكر' }
  ]);

  const KEYS = Object.freeze({
    selection: 'khadra-t:last-selection:v1',
    favorites: 'khadra-t:favorites:v1',
    recent: 'khadra-t:recent-brews:v1'
  });

  /* ---------- الأرقام ---------- */

  // تقريب عشري نصف-لأعلى بكسور دقيقة (BigInt) لتجنب أخطاء الفاصلة العائمة.
  function decimalFraction(value) {
    if (!Number.isFinite(Number(value)) || Number(value) < 0) {
      throw new Error('قيمة رقمية غير صالحة.');
    }
    const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
    const parts = mantissa.split('.');
    const coefficient = BigInt(parts.join('').replace(/^\+/, ''));
    const scale = (parts[1] || '').length - Number(exponent);
    return scale >= 0
      ? { numerator: coefficient, denominator: 10n ** BigInt(scale) }
      : { numerator: coefficient * 10n ** BigInt(-scale), denominator: 1n };
  }

  // (base × quantity ÷ divisor) مقرّبة لخانة عشرية واحدة، وبدون كسر إذا كانت صحيحة.
  function roundedProductText(base, quantity = 1, divisor = 1) {
    const a = decimalFraction(base);
    const b = decimalFraction(quantity);
    const d = decimalFraction(divisor);
    const numerator = a.numerator * b.numerator * d.denominator;
    const denominator = a.denominator * b.denominator * d.numerator;
    if (denominator <= 0n) throw new Error('قيمة رقمية غير صالحة.');
    const tenths = (numerator * 20n + denominator) / (denominator * 2n);
    if (numerator % denominator === 0n) return String(tenths / 10n);
    return String(tenths / 10n) + '.' + String(tenths % 10n);
  }

  // يقبل الأرقام العربية (٠-٩) والفارسية والفاصلة العشرية العربية (٫).
  function normalizeDigits(raw) {
    return String(raw == null ? '' : raw)
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
      .replace(/٫/g, '.')
      .trim();
  }

  const NUMBER_PATTERN = /^[+]?((\d+(\.\d*)?)|(\.\d+))([eE][+-]?\d+)?$/;

  function parseAmount(raw, limits) {
    const text = normalizeDigits(raw);
    const value = Number(text);
    if (!text || !NUMBER_PATTERN.test(text) || !Number.isFinite(value) ||
        value < limits.min || value > limits.max) {
      throw new Error('أدخل ' + limits.label + ' صحيحة بين ' + limits.min + ' و' + limits.max + '.');
    }
    return value;
  }

  // نص الرقم بعد التوحيد إذا كان صالحاً، وإلا null.
  function validAmountText(raw, limits) {
    if (typeof raw !== 'string' && typeof raw !== 'number') return null;
    try {
      parseAmount(raw, limits);
      return normalizeDigits(raw);
    } catch {
      return null;
    }
  }

  // مدة الخدرة اليدوية نص حر؛ لا نحفظ أي وسوم أو محارف تحكم.
  function safeSteepText(value) {
    return typeof value === 'string' && value.length <= 200 &&
      !/[<>\u0000-\u001f]/.test(value) ? value : '';
  }

  function minutesText(range) {
    if (!range) return '-';
    if (typeof range === 'string') return range;
    if (range.min === range.max) return range.min + ' دقيقة';
    return range.min + ' – ' + range.max + ' دقيقة';
  }

  function tasteLabel(value) {
    const taste = TASTES.find((t) => t.value === value);
    return taste ? taste.label : 'مناسب';
  }

  const isTaste = (value) => TASTES.some((t) => t.value === value);

  /* ---------- الكتالوج ---------- */

  const CATALOG = Object.freeze([
    ...SIMPLE_TEAS.map((t) => Object.freeze({
      value: 'simple:' + t.id,
      id: t.id,
      typeId: null,
      label: t.teaType ? (t.cardName || t.brand) + ' — ' + t.teaType : (t.cardName || t.brand),
      brand: t.cardName || t.brand,
      realBrand: t.brand,
      teaType: t.teaType || '',
      image: t.image || '',
      featured: Boolean(t.featured),
      type: 'simple',
      row: t
    })),
    ...BRANDED_TEAS.flatMap((b) => b.items.map((it) => Object.freeze({
      value: 'brand:' + b.brandId,
      id: it.id,
      typeId: it.id,
      brandId: b.brandId,
      label: it.teaType ? (it.cardName || b.brand) + ' — ' + it.teaType : (it.cardName || b.brand),
      brand: it.cardName || b.brand,
      realBrand: b.brand,
      teaType: it.teaType || '',
      image: it.image || '',
      featured: Boolean(it.featured),
      type: 'brand',
      row: it
    })))
  ]);

  const PRODUCTS = Array.from(new Set(CATALOG.map((item) => item.value)));

  function brandFor(product) {
    return BRANDED_TEAS.find((b) => 'brand:' + b.brandId === product) || null;
  }

  function subtypesFor(product) {
    return CATALOG.filter((item) => item.type === 'brand' && item.value === product);
  }

  // النوع الفرعي الصحيح: المطلوب إن كان يتبع نفس البراند، وإلا أول نوع.
  function resolveSubtype(product, preferred) {
    const brand = brandFor(product);
    if (!brand) return null;
    return brand.items.some((it) => it.id === preferred) ? preferred : brand.items[0].id;
  }

  function findItem(product, subtype) {
    return CATALOG.find((item) => item.value === product &&
      (item.type === 'simple' || item.typeId === subtype)) ||
      CATALOG.find((item) => item.value === product) || CATALOG[0];
  }

  // مطابقة صارمة لعنصر محفوظ (مفضلة أو سجل).
  function resolveSaved(value) {
    if (!value || typeof value !== 'object') return null;
    return CATALOG.find((item) => item.value === value.product &&
      (item.typeId ? item.typeId === value.subtype : value.subtype == null)) || null;
  }

  const identityOf = (item) => ({ product: item.value, subtype: item.typeId || null });
  const sameIdentity = (a, b) => a.product === b.product && a.subtype === b.subtype;

  function searchCatalog(query) {
    const q = normalizeArabic(query);
    const matched = CATALOG.filter((item) => !q || normalizeArabic(
      item.label + ' ' + item.brand + ' ' + item.realBrand + ' ' + item.teaType).includes(q));
    if (q) return matched;
    return [...matched.filter((i) => i.featured), ...matched.filter((i) => !i.featured)];
  }

  function normalizeArabic(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[إأآا]/g, 'ا')
      .replace(/[ة]/g, 'ه')
      .replace(/[ى]/g, 'ي')
      .replace(/ـ/g, '')
      .replace(/[-—_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---------- الحالة والحساب ---------- */

  function defaultState() {
    return {
      mode: 'tea',
      product: CATALOG[0].value,
      subtype: null,
      taste: 'normal',
      water: '1000',
      waterMode: 'preset',
      manual: { tea: '', sugar: '', steep: '' }
    };
  }

  function withProduct(state, product, subtype) {
    const next = { ...state, product, subtype: resolveSubtype(product, subtype) };
    return next;
  }

  function teaObjectFor(state) {
    if (state.mode === 'manual') {
      const teaPerLiter = parseAmount(state.manual.tea, LIMITS.tea);
      const sugarPerLiter = parseAmount(state.manual.sugar, LIMITS.sugar);
      const steep = String(state.manual.steep || '').trim();
      return {
        item: null,
        brandLabel: 'إدخال يدوي',
        teaType: 'وزنة مخصصة',
        teaPerLiter,
        sugarPerLiter,
        steepMinutes: steep || '-'
      };
    }
    const item = findItem(state.product, state.subtype);
    const brand = item.type === 'brand' ? brandFor(item.value) : null;
    return {
      item,
      brandLabel: brand ? brand.brand : item.row.brand,
      teaType: item.row.teaType,
      teaPerLiter: Number(item.row.teaPerLiterByTaste[state.taste]),
      sugarPerLiter: Number(item.row.sugarPerLiterByTaste[state.taste] || 0),
      steepMinutes: item.row.steepMinutes
    };
  }

  // يرجع {ok:true, ...} أو {ok:false, message}. لا يرمي أخطاء.
  function calculate(state) {
    try {
      const waterMl = parseAmount(state.water, LIMITS.water);
      const tea = teaObjectFor(state);
      if (!Number.isFinite(tea.teaPerLiter) || tea.teaPerLiter <= 0 ||
          !Number.isFinite(tea.sugarPerLiter) || tea.sugarPerLiter < 0 ||
          !Number.isFinite(tea.teaPerLiter * (waterMl / 1000)) ||
          !Number.isFinite(tea.sugarPerLiter * (waterMl / 1000))) {
        throw new Error('قيم الحساب غير صالحة.');
      }
      return {
        ok: true,
        tea,
        waterText: normalizeDigits(state.water),
        teaGrams: roundedProductText(tea.teaPerLiter, waterMl, 1000),
        sugarGrams: tea.sugarPerLiter === 0 ? null : roundedProductText(tea.sugarPerLiter, waterMl, 1000),
        sugarText: tea.sugarPerLiter === 0 ? 'بدون سكر'
          : roundedProductText(tea.sugarPerLiter, waterMl, 1000) + ' جم',
        cups: roundedProductText(waterMl, 1, CUP_ML),
        steepText: minutesText(tea.steepMinutes),
        tasteText: state.mode === 'manual' ? 'حسب الوزنة' : tasteLabel(state.taste)
      };
    } catch (error) {
      return { ok: false, message: String((error && error.message) || 'قيم الحساب غير صالحة.') };
    }
  }

  function shareText(result) {
    if (!result || !result.ok) return '';
    const typeText = result.tea.teaType ? ' (' + result.tea.teaType + ')' : '';
    return [
      '☕ خدرة شاي',
      '',
      '📌 النوع: ' + result.tea.brandLabel + typeText,
      '💧 الماء: ' + result.waterText + ' مل',
      '✨ المذاق: ' + result.tasteText,
      '',
      '⚖️ الشاي: ' + result.teaGrams + ' جم',
      '🍬 السكر: ' + result.sugarText,
      '⏱️ الخدرة: ' + result.steepText,
      '☕ البيالات: ' + result.cups + ' (تقريباً)',
      '',
      'تم الحساب عبر خدرة شاي',
      SHARE_URL
    ].join('\n');
  }

  /* ---------- آخر اختيار ---------- */

  function serializeSelection(state) {
    const tea = validAmountText(state.manual.tea, LIMITS.tea);
    const sugar = validAmountText(state.manual.sugar, LIMITS.sugar);
    return {
      version: 1,
      mode: state.mode,
      product: state.product,
      subtype: state.product.startsWith('brand:') ? state.subtype : null,
      taste: state.taste,
      waterMl: normalizeDigits(state.water),
      waterMode: state.waterMode,
      manual: tea !== null && sugar !== null ? {
        teaPerLiter: tea,
        sugarPerLiter: sugar,
        steepMinutes: safeSteepText(String(state.manual.steep || '').trim())
      } : null
    };
  }

  // يرجع حالة كاملة أو null إذا لم يوجد حفظ صالح (فتُستخدم القيم الافتراضية).
  function restoreSelection(raw) {
    let saved;
    try { saved = JSON.parse(raw); } catch { return null; }
    if (!saved || typeof saved !== 'object' || Array.isArray(saved) || saved.version !== 1) return null;

    let state = defaultState();
    if (PRODUCTS.includes(saved.product)) state.product = saved.product;
    if (isTaste(saved.taste)) state.taste = saved.taste;

    const manual = saved.manual && typeof saved.manual === 'object' && !Array.isArray(saved.manual)
      ? saved.manual : {};
    const tea = validAmountText(manual.teaPerLiter, LIMITS.tea);
    const sugar = validAmountText(manual.sugarPerLiter, LIMITS.sugar);
    state.manual = {
      tea: tea === null ? '' : tea,
      sugar: sugar === null ? '' : sugar,
      steep: safeSteepText(manual.steepMinutes)
    };
    if (saved.mode === 'manual' && tea !== null && sugar !== null) state.mode = 'manual';

    state = withProduct(state, state.product, typeof saved.subtype === 'string' ? saved.subtype : undefined);

    const water = validAmountText(saved.waterMl, LIMITS.water);
    state.water = water === null ? '1000' : water;
    const amount = Number(state.water);
    state.waterMode = water !== null &&
      (saved.waterMode === 'custom' || (amount !== 500 && amount !== 1000)) ? 'custom' : 'preset';
    return state;
  }

  /* ---------- المفضلة والسجل ---------- */

  function parseCollection(raw) {
    try {
      const data = JSON.parse(raw);
      return data && data.version === 1 && Array.isArray(data.items) ? data.items : [];
    } catch {
      return [];
    }
  }

  const packCollection = (items) => JSON.stringify({ version: 1, items });

  function loadFavorites(items) {
    const favorites = [];
    items.forEach((value) => {
      const item = resolveSaved(value);
      if (item && !favorites.some((f) => sameIdentity(f, identityOf(item)))) favorites.push(identityOf(item));
    });
    return favorites;
  }

  function toggleFavorite(favorites, identity) {
    return favorites.some((f) => sameIdentity(f, identity))
      ? favorites.filter((f) => !sameIdentity(f, identity))
      : [...favorites, identity];
  }

  function normalizeRecent(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const numeric = (raw, limits) => {
      const valid = validAmountText(raw, limits);
      return valid === null ? null : String(Number(valid));
    };
    const waterMl = numeric(value.waterMl, LIMITS.water);
    if (waterMl === null) return null;
    const waterMode = value.waterMode === 'custom' || !PRESET_WATER.includes(waterMl) ? 'custom' : 'preset';
    if (value.mode === 'tea') {
      const item = resolveSaved(value);
      if (!item || !isTaste(value.taste)) return null;
      return { mode: 'tea', ...identityOf(item), taste: value.taste, waterMl, waterMode };
    }
    if (value.mode !== 'manual') return null;
    const teaPerLiter = numeric(value.teaPerLiter, LIMITS.tea);
    const sugarPerLiter = numeric(value.sugarPerLiter, LIMITS.sugar);
    const steepMinutes = value.steepMinutes == null ? '' : value.steepMinutes;
    if (teaPerLiter === null || sugarPerLiter === null ||
        typeof steepMinutes !== 'string' || safeSteepText(steepMinutes) !== steepMinutes) return null;
    return { mode: 'manual', teaPerLiter, sugarPerLiter, steepMinutes, waterMl, waterMode };
  }

  const sameRecent = (a, b) => Boolean(a && b) && JSON.stringify(a) === JSON.stringify(b);

  function loadRecent(items) {
    const recent = [];
    items.forEach((value) => {
      const entry = normalizeRecent(value);
      if (entry && recent.length < RECENT_LIMIT && !sameRecent(entry, recent[recent.length - 1])) {
        recent.push(entry);
      }
    });
    return recent;
  }

  // الخدرة من الحالة الحالية، فقط إذا كان الحساب صالحاً.
  function recentEntryFor(state) {
    if (!calculate(state).ok) return null;
    const water = { waterMl: state.water, waterMode: state.waterMode };
    return normalizeRecent(state.mode === 'manual' ? {
      mode: 'manual',
      teaPerLiter: state.manual.tea,
      sugarPerLiter: state.manual.sugar,
      steepMinutes: String(state.manual.steep || '').trim(),
      ...water
    } : {
      mode: 'tea', ...identityOf(findItem(state.product, state.subtype)), taste: state.taste, ...water
    });
  }

  // أحدث خدرة أولاً؛ تكرارها ينقلها للأعلى بدل ما تتكرر في القائمة.
  function addRecent(recent, entry) {
    if (!entry || sameRecent(entry, recent[0])) return recent;
    return [entry, ...recent.filter((e) => !sameRecent(e, entry))].slice(0, RECENT_LIMIT);
  }

  // تطبيق خدرة محفوظة على الحالة الحالية.
  function stateFromRecent(state, value) {
    const entry = normalizeRecent(value);
    if (!entry) return null;
    let next = { ...state, mode: entry.mode, water: entry.waterMl, waterMode: entry.waterMode };
    if (entry.mode === 'tea') {
      next = withProduct(next, entry.product, entry.subtype);
      next.taste = entry.taste;
    } else {
      next.manual = { tea: entry.teaPerLiter, sugar: entry.sugarPerLiter, steep: entry.steepMinutes };
    }
    return next;
  }

  root.KhadraCore = Object.freeze({
    CUP_ML, SHARE_URL, LIMITS, TASTES, KEYS, CATALOG, RECENT_LIMIT,
    roundedProductText, normalizeDigits, parseAmount, validAmountText, safeSteepText,
    minutesText, tasteLabel, normalizeArabic,
    brandFor, subtypesFor, findItem, resolveSaved, identityOf, sameIdentity, searchCatalog,
    defaultState, withProduct, calculate, shareText,
    serializeSelection, restoreSelection,
    parseCollection, packCollection, loadFavorites, toggleFavorite,
    normalizeRecent, sameRecent, loadRecent, recentEntryFor, addRecent, stateFromRecent
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
