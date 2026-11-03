/*
 * قواعد كتالوج الشاي — نفس الملف يستخدمه الموقع ولوحة التحكم والخادم،
 * فالبيانات اللي تنحفظ من اللوحة لازم تمر بنفس الفحص في كل مكان.
 * الشكل المحفوظ: { version: 1, rev, updatedAt, simple: [...], branded: [{ brandId, brand, items: [...] }] }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KhadraCatalog = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TASTES = ['normal', 'medium', 'nosugar'];
  const LIMITS = Object.freeze({
    tea: { min: 0.1, max: 1000 },
    sugar: { min: 0, max: 2000 },
    steep: { min: 1, max: 240 },
    simple: 300, groups: 50, items: 20, name: 40, type: 12
  });
  const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const BUILTIN_IMAGE = /^[A-Za-z0-9_-]{1,60}\.webp$/;
  const UPLOAD_IMAGE = /^upload:[a-z0-9-]{6,60}\.(webp|png)$/;
  const UNSAFE = /[<>\u0000-\u001f\u007f]/;
  const TEA_TYPES = ['OP', 'OP1', 'OPA', 'BOP', 'BOP1', 'FBOP', 'FBOP1', 'FOP', 'FOP1', 'FBOB1', 'حديد'];

  function text(value, field, max, required, errors) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (required && !v) errors.push(field + ': مطلوب');
    else if (v.length > max) errors.push(field + ': أطول من ' + max + ' حرف');
    else if (UNSAFE.test(v)) errors.push(field + ': فيه رموز غير مسموحة');
    return v;
  }

  function amount(value, limits, field, errors) {
    const n = typeof value === 'number' ? value : Number(value);
    if (value === '' || value == null || !Number.isFinite(n) || n < limits.min || n > limits.max) {
      errors.push(field + ': لازم رقم بين ' + limits.min + ' و' + limits.max);
      return 0;
    }
    return Math.round(n * 100) / 100;
  }

  function tea(raw, where, errors, needsBrand) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    out.id = typeof item.id === 'string' && ID.test(item.id) ? item.id : (errors.push(where + ': معرّف غير صالح'), '');
    out.teaType = text(item.teaType, where + ' نوع الورق', LIMITS.type, false, errors);
    if (needsBrand) out.brand = text(item.brand, where + ' الاسم الكامل', LIMITS.name, true, errors);
    out.cardName = text(item.cardName, where + ' الاسم', LIMITS.name, true, errors);
    const image = typeof item.image === 'string' ? item.image : '';
    if (image && !BUILTIN_IMAGE.test(image) && !UPLOAD_IMAGE.test(image)) errors.push(where + ': اسم الصورة غير صالح');
    out.image = image;
    if (item.featured) out.featured = true;
    out.teaPerLiterByTaste = {};
    out.sugarPerLiterByTaste = {};
    const teaIn = item.teaPerLiterByTaste || {};
    const sugarIn = item.sugarPerLiterByTaste || {};
    TASTES.forEach((t) => {
      out.teaPerLiterByTaste[t] = amount(teaIn[t], LIMITS.tea, where + ' شاي (' + t + ')', errors);
      out.sugarPerLiterByTaste[t] = amount(sugarIn[t], LIMITS.sugar, where + ' سكر (' + t + ')', errors);
    });
    const steep = item.steepMinutes || {};
    const min = amount(steep.min, LIMITS.steep, where + ' مدة الخدرة (من)', errors);
    const max = amount(steep.max, LIMITS.steep, where + ' مدة الخدرة (إلى)', errors);
    if (min > max) errors.push(where + ': بداية مدة الخدرة أكبر من نهايتها');
    out.steepMinutes = { min, max };
    return out;
  }

  // يرجع { ok, data, errors } — data نسخة نظيفة فيها الحقول المعروفة فقط.
  function validate(raw) {
    const errors = [];
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    if (src.version !== 1) errors.push('إصدار الكتالوج غير معروف');
    const simpleIn = Array.isArray(src.simple) ? src.simple : (errors.push('قائمة الأنواع مفقودة'), []);
    const brandedIn = Array.isArray(src.branded) ? src.branded : (errors.push('قائمة البراندات مفقودة'), []);
    if (simpleIn.length > LIMITS.simple) errors.push('عدد الأنواع أكثر من ' + LIMITS.simple);
    if (brandedIn.length > LIMITS.groups) errors.push('عدد البراندات أكثر من ' + LIMITS.groups);

    const simple = simpleIn.slice(0, LIMITS.simple).map((t, i) => tea(t, 'النوع ' + (i + 1), errors, true));
    const branded = brandedIn.slice(0, LIMITS.groups).map((g, i) => {
      const group = g && typeof g === 'object' ? g : {};
      const where = 'البراند ' + (i + 1);
      const brandId = typeof group.brandId === 'string' && ID.test(group.brandId) ? group.brandId : (errors.push(where + ': معرّف غير صالح'), '');
      const brand = text(group.brand, where + ' الاسم', LIMITS.name, true, errors);
      const itemsIn = Array.isArray(group.items) ? group.items : [];
      if (!itemsIn.length || itemsIn.length > LIMITS.items) errors.push(where + ': لازم يكون فيه من 1 إلى ' + LIMITS.items + ' أنواع');
      const items = itemsIn.slice(0, LIMITS.items).map((t, j) => tea(t, where + ' / النوع ' + (j + 1), errors, false));
      return { brandId, brand, items };
    });

    const ids = [...simple.map((t) => t.id), ...branded.flatMap((g) => g.items.map((t) => t.id))];
    if (new Set(ids).size !== ids.length) errors.push('فيه معرّفات مكررة');
    const brandIds = branded.map((g) => g.brandId);
    if (new Set(brandIds).size !== brandIds.length) errors.push('فيه براندات مكررة');
    if (!ids.length) errors.push('لازم يكون فيه نوع شاي واحد على الأقل');

    const data = { version: 1, rev: Number.isInteger(src.rev) && src.rev >= 0 ? src.rev : 0, simple, branded };
    if (typeof src.updatedAt === 'string' && src.updatedAt.length <= 40) data.updatedAt = src.updatedAt;
    return errors.length ? { ok: false, errors } : { ok: true, data, errors: [] };
  }

  // من بيانات data.js (الأصلية) إلى شكل الكتالوج المحفوظ.
  function fromBundled(bundled) {
    return validate({
      version: 1, rev: 0,
      simple: bundled.SIMPLE_TEAS,
      branded: bundled.BRANDED_TEAS
    }).data;
  }

  // من شكل الكتالوج إلى الشكل اللي يفهمه core.js.
  function toCoreData(catalog) {
    return { SIMPLE_TEAS: catalog.simple, BRANDED_TEAS: catalog.branded };
  }

  function newId(prefix) {
    const rand = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    return (prefix || 't') + '-' + rand;
  }

  // رابط الصورة: صور الموقع الأصلية من img/، والمرفوعة من اللوحة عبر /api/image/.
  function imageUrl(image, kind, base) {
    if (!image) return '';
    if (image.startsWith('upload:')) return '/api/image/' + kind + '/' + image.slice(7);
    return (base || '') + 'img/' + kind + '/' + image;
  }

  return Object.freeze({ TASTES, LIMITS, TEA_TYPES, validate, fromBundled, toCoreData, newId, imageUrl });
});
