// Run: node tests/core-parity.cjs
// يثبت أن منطق النسخة الجديدة (assets/core.js) يعطي نفس نتائج النسخة المعتمدة
// السابقة حرفياً: نفس المقادير، نفس نص المشاركة، نفس رسائل الخطأ، ونفس صيغ الحفظ
// (آخر اختيار، المفضلة، آخر الخدرات) في الاتجاهين.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {createLegacy, LEGACY_COMMIT} = require("./helpers/legacy-harness.cjs");

const root = path.resolve(__dirname, "..");
const ctx = vm.createContext({});
for (const file of ["assets/data.js", "assets/core.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx, {filename: file});
}
const Core = ctx.KhadraCore;
const Data = ctx.KhadraData;

let checks = 0;
const assert = (value, message) => { checks++; if (!value) throw Error(message); };
const eq = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b),
  message + "\n  expected: " + JSON.stringify(b) + "\n  actual:   " + JSON.stringify(a));

const legacy = createLegacy();
const L = legacy.api;

// 1) بيانات الكتالوج مطابقة حرفياً.
eq(Data.SIMPLE_TEAS, L.SIMPLE_TEAS, "SIMPLE_TEAS changed");
eq(Data.BRANDED_TEAS, L.BRANDED_TEAS, "BRANDED_TEAS changed");
const strip = (i) => ({value: i.value, typeId: i.typeId || null, label: i.label, brand: i.brand,
  realBrand: i.realBrand, teaType: i.teaType, image: i.image, featured: i.featured, type: i.type});
eq(Core.CATALOG.map(strip), L.getTeaCatalogItems().map(strip), "catalog items changed");

// 2) كل نوع × كل مذاق × كميات ماء: نفس نص المشاركة.
const waters = ["1", "50", "100", "250", "500", "780", "1000", "1001", "1500", "2000", "5000", "780.5", "100000"];
let cases = 0;
for (const item of Core.CATALOG) {
  L.selectTeaCard(L.getTeaCatalogItems().find((x) => x.value === item.value && (x.typeId || null) === item.typeId));
  legacy.flush();
  for (const taste of ["normal", "medium", "nosugar"]) {
    for (const water of waters) {
      legacy.setTaste(taste);
      legacy.e("waterMl").value = water;
      L.render();
      const state = {...Core.defaultState(), product: item.value, subtype: item.typeId, taste, water};
      eq(Core.shareText(Core.calculate(state)), L.getResultText(), "share text " + item.id + " " + taste + " " + water);
      cases++;
    }
  }
}

// 3) الوزنة اليدوية.
legacy.setMode("manual");
for (const [tea, sugar, steep, water] of [
  ["12", "50", "", "1000"], ["12.55", "0", "20-25 دقيقة", "780.5"], ["0.1", "2000", "30 دقيقة", "1"],
  ["1000", "0", "", "100000"], ["13.5", "50.125", "  ربع ساعة ", "1001"]]) {
  legacy.e("manualTeaPerLiter").value = tea;
  legacy.e("manualSugarPerLiter").value = sugar;
  legacy.e("manualSteepMinutes").value = steep;
  legacy.e("waterMl").value = water;
  L.render();
  const state = {...Core.defaultState(), mode: "manual", water, manual: {tea, sugar, steep}};
  eq(Core.shareText(Core.calculate(state)), L.getResultText(), "manual share " + tea + "/" + sugar);
  cases++;
}

// 4) رسائل الخطأ لنفس المدخلات غير الصالحة.
const errorOf = () => legacy.e("output").textContent.replace(/^⚠️ /, "");
for (const bad of ["", "0", "-1", "0.5", "100001", "NaN", "Infinity", "1e309", "1e", "abc"]) {
  legacy.e("manualTeaPerLiter").value = "12";
  legacy.e("manualSugarPerLiter").value = "50";
  legacy.e("waterMl").value = bad;
  L.render();
  const result = Core.calculate({...Core.defaultState(), mode: "manual", water: bad, manual: {tea: "12", sugar: "50", steep: ""}});
  assert(!result.ok && result.message === errorOf(), "water error message " + bad);
  assert(Core.shareText(result) === "" && L.getResultText() === "", "invalid share text " + bad);
}
for (const [field, bad] of [["tea", ""], ["tea", "0.01"], ["tea", "1000.1"], ["sugar", "-1"], ["sugar", "2000.1"], ["sugar", "abc"]]) {
  const manual = {tea: "12", sugar: "50", steep: "", [field]: bad};
  legacy.e("waterMl").value = "1000";
  legacy.e("manualTeaPerLiter").value = manual.tea;
  legacy.e("manualSugarPerLiter").value = manual.sugar;
  L.render();
  const result = Core.calculate({...Core.defaultState(), mode: "manual", manual});
  assert(!result.ok && result.message === errorOf(), "manual error " + field + " " + bad);
}
legacy.setMode("tea");

// 5) التقريب العشري — فحص شامل لكل القيم من 1 إلى 5000 مل.
const rows = [...Data.SIMPLE_TEAS, ...Data.BRANDED_TEAS.flatMap((b) => b.items)];
let decimalChecks = 0;
for (const row of rows) for (const taste of ["normal", "medium", "nosugar"]) for (let water = 1; water <= 5000; water++) {
  for (const field of ["teaPerLiterByTaste", "sugarPerLiterByTaste"]) {
    const base = row[field][taste];
    const expected = Math.floor((Math.round(base * 10) * water + 500) / 1000) / 10;
    if (Number(Core.roundedProductText(base, water, 1000)) !== expected) throw Error("rounding " + row.id + " " + water);
    decimalChecks++;
  }
}
for (let water = 1; water <= 5000; water++) {
  if (Number(Core.roundedProductText(water, 1, 100)) !== Math.floor((water + 5) / 10) / 10) throw Error("cups " + water);
}

// 6) الأرقام العربية تعطي نفس نتيجة الأرقام الإنجليزية.
eq(Core.shareText(Core.calculate({...Core.defaultState(), water: "٧٨٠٫٥"})),
  Core.shareText(Core.calculate({...Core.defaultState(), water: "780.5"})), "arabic digits");

// 7) آخر اختيار: ما تحفظه النسخة القديمة تسترجعه الجديدة بنفس النتيجة، والعكس.
let roundTrips = 0;
const legacyStates = [];
for (const item of L.getTeaCatalogItems()) for (const taste of ["normal", "medium", "nosugar"]) {
  const s = createLegacy();
  s.api.selectTeaCard(item); s.setTaste(taste); s.api.render();
  legacyStates.push(s);
}
for (const water of ["500", "780.5", "1000", "1001"]) {
  const s = createLegacy();
  s.e("customWaterBtn").fire("click"); s.e("waterMl").value = water; s.e("waterMl").fire("input");
  legacyStates.push(s);
}
{
  const s = createLegacy(); s.setMode("manual");
  s.e("manualTeaPerLiter").value = "12.55"; s.e("manualSugarPerLiter").value = "0";
  s.e("manualSteepMinutes").value = "20-25 دقيقة"; s.api.render();
  legacyStates.push(s);
}
for (const s of legacyStates) {
  const restored = Core.restoreSelection(s.saved());
  eq(Core.shareText(Core.calculate(restored)), s.state().text, "legacy → new selection");
  eq(restored.waterMode === "custom", s.state().custom, "legacy → new water mode");
  const back = createLegacy(JSON.stringify(Core.serializeSelection(restored)));
  eq(back.state().text, s.state().text, "new → legacy selection");
  eq(back.state().custom, s.state().custom, "new → legacy water mode");
  eq(Object.keys(Core.serializeSelection(restored)).sort(), Object.keys(JSON.parse(s.saved())).sort(), "selection keys");
  roundTrips++;
}
// حالات تالفة: القديم والجديد يرجعان لنفس الافتراضي.
const source = {version: 1, mode: "tea", product: "brand:munais", subtype: "munais-bop1", taste: "medium", waterMl: "780.5", waterMode: "custom", manual: null};
const corrupt = ["{", "null", "[]", "123", JSON.stringify({version: 2}), JSON.stringify({version: "1"}),
  JSON.stringify({...source, waterMl: "NaN"}), JSON.stringify({...source, waterMl: "0"}),
  JSON.stringify({...source, product: "simple:removed"}), JSON.stringify({...source, subtype: "removed"}),
  JSON.stringify({...source, subtype: "wazah-op1"}), JSON.stringify({version: 1, waterMl: "500"}),
  JSON.stringify({...source, mode: "manual", manual: {teaPerLiter: "12", sugarPerLiter: "-1", steepMinutes: "x"}}),
  JSON.stringify({...source, mode: "manual", manual: {teaPerLiter: "12", sugarPerLiter: "0", steepMinutes: "<img src=x onerror=alert(1)>"}}),
  JSON.stringify({...source, mode: "invalid", taste: "invalid"})];
for (const raw of corrupt) {
  const old = createLegacy(raw);
  const state = Core.restoreSelection(raw) || Core.defaultState();
  eq(Core.shareText(Core.calculate(state)), old.state().text, "corrupt selection " + raw);
  eq(state.manual.steep, old.state().steep, "corrupt steep " + raw);
}

// 8) المفضلة وآخر الخدرات: نفس صيغة التخزين.
const FK = Core.KEYS.favorites, RK = Core.KEYS.recent;
{
  const s = createLegacy();
  for (const id of ["munais-bop1", "wazah-fbob1"]) {
    s.api.selectTeaCard(s.api.getTeaCatalogItems().find((x) => x.typeId === id)); s.api.toggleCurrentFavorite();
  }
  s.api.selectTeaCard(s.api.getTeaCatalogItems()[3]); s.api.toggleCurrentFavorite();
  s.e("calculateBtn").fire("click");
  s.api.restoreRecentBrew({mode: "manual", teaPerLiter: "12.55", sugarPerLiter: "0", steepMinutes: "20-25 دقيقة", waterMl: "1001", waterMode: "custom"});
  const dump = s.dump();
  const favorites = Core.loadFavorites(Core.parseCollection(dump[FK]));
  const recent = Core.loadRecent(Core.parseCollection(dump[RK]));
  eq(favorites, s.api.collections().favorites, "legacy favorites load");
  eq(recent, s.api.collections().recent, "legacy recent load");
  const back = createLegacy(null, "normal", {[FK]: Core.packCollection(favorites), [RK]: Core.packCollection(recent)});
  eq(back.api.collections().favorites, favorites, "new → legacy favorites");
  eq(back.api.collections().recent, recent, "new → legacy recent");
  for (const entry of recent) {
    const before = Core.defaultState();
    const old = createLegacy(); old.api.restoreRecentBrew(entry);
    eq(Core.shareText(Core.calculate(Core.stateFromRecent(before, entry))), old.state().text, "replay recent");
  }
}
const teaEntry = {mode: "tea", product: "brand:munais", subtype: "munais-bop1", taste: "medium", waterMl: "780.5", waterMode: "custom"};
const manualEntry = {mode: "manual", teaPerLiter: "12.55", sugarPerLiter: "0", steepMinutes: "20-25 دقيقة", waterMl: "1001", waterMode: "custom"};
for (const entry of [null, {}, [], {...teaEntry, product: "removed"}, {...teaEntry, subtype: "removed"},
  {...teaEntry, subtype: "wazah-op1"}, {...teaEntry, taste: "removed"}, {...teaEntry, waterMl: ""},
  {...manualEntry, sugarPerLiter: "-1"}, {...manualEntry, teaPerLiter: null},
  {...manualEntry, steepMinutes: "<img src=x onerror=alert(1)>"}, teaEntry, manualEntry, {...teaEntry, waterMl: "0500"}]) {
  eq(Core.normalizeRecent(entry), legacy.api.normalizeRecentBrew(entry), "normalizeRecent " + JSON.stringify(entry));
}
for (const raw of ["{", "null", "[]", "false", JSON.stringify({version: 2, items: [teaEntry]}), JSON.stringify({version: 1, items: {}}),
  Core.packCollection([null, {}, {product: "brand:munais", subtype: "munais-bop1"}, {product: "brand:munais", subtype: "removed"}, {product: "brand:munais", subtype: "munais-bop1"}])]) {
  const old = createLegacy(null, "normal", {[FK]: raw, [RK]: raw});
  eq(Core.loadFavorites(Core.parseCollection(raw)), old.api.collections().favorites, "corrupt favorites " + raw);
  eq(Core.loadRecent(Core.parseCollection(raw)), old.api.collections().recent, "corrupt recent " + raw);
}

// 9) السجل: حد 10، الأحدث أولاً، وإعادة خدرة قديمة تنقلها للأعلى بدون تكرار.
{
  let recent = [];
  for (let i = 1; i <= 12; i++) recent = Core.addRecent(recent, Core.recentEntryFor({...Core.defaultState(), water: String(1000 + i), waterMode: "custom"}));
  assert(recent.length === 10 && recent[0].waterMl === "1012" && recent[9].waterMl === "1003", "recent cap/order");
  const older = recent[5];
  recent = Core.addRecent(recent, older);
  assert(recent.length === 10 && recent[0] === older && recent.filter((e) => Core.sameRecent(e, older)).length === 1, "replay moves to top");
  assert(Core.addRecent(recent, recent[0]) === recent, "duplicate top ignored");
  assert(Core.recentEntryFor({...Core.defaultState(), water: ""}) === null, "invalid brew not recorded");
}

console.log({legacyCommit: LEGACY_COMMIT, shareCases: cases, decimalChecks, roundTrips, checks, failures: 0});
