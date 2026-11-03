// Run: node tests/catalog-schema.cjs
// قواعد الكتالوج: الكتالوج الأصلي صالح، والمنطق المبني عليه يطابق الأصلي حرفياً، والبيانات الغلط ترفض.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const Catalog = require("../assets/catalog.js");
const bundled = require("../assets/data.js");

const root = path.resolve(__dirname, "..");
const ctx = vm.createContext({});
for (const f of ["assets/data.js", "assets/core.js"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx);
let checks = 0;
const ok = (v, m) => { checks++; assert.ok(v, m); };

const base = Catalog.fromBundled(bundled);
ok(Catalog.validate(base).ok, "bundled catalog valid");
ok(JSON.stringify(Catalog.toCoreData(base).SIMPLE_TEAS) === JSON.stringify(bundled.SIMPLE_TEAS), "simple teas unchanged by validation");
ok(JSON.stringify(Catalog.toCoreData(base).BRANDED_TEAS) === JSON.stringify(bundled.BRANDED_TEAS), "branded teas unchanged by validation");

// المنطق المبني من الكتالوج المحفوظ = المنطق الأصلي.
const fromCatalog = ctx.createKhadraCore(Catalog.toCoreData(JSON.parse(JSON.stringify(base))));
for (const item of ctx.KhadraCore.CATALOG) for (const taste of ["normal", "medium", "nosugar"]) for (const water of ["1", "500", "780.5", "1000", "5000"]) {
  const s = { ...ctx.KhadraCore.defaultState(), product: item.value, subtype: item.typeId, taste, water };
  ok(fromCatalog.shareText(fromCatalog.calculate(s)) === ctx.KhadraCore.shareText(ctx.KhadraCore.calculate(s)), "same result " + item.id);
}

// نوع جديد يظهر في المنطق ويُحسب.
const added = JSON.parse(JSON.stringify(base));
added.simple.push({ id: "t-new123", brand: "شاي التجربة", cardName: "التجربة", teaType: "OP1", image: "upload:abc123def.webp",
  teaPerLiterByTaste: { normal: 11, medium: 12, nosugar: 11 }, sugarPerLiterByTaste: { normal: 45, medium: 50, nosugar: 0 }, steepMinutes: { min: 15, max: 20 } });
const v = Catalog.validate(added);
ok(v.ok, "added tea valid: " + v.errors.join(" | "));
const core = ctx.createKhadraCore(Catalog.toCoreData(v.data));
const r = core.calculate({ ...core.defaultState(), product: "simple:t-new123", water: "500" });
ok(r.ok && r.teaGrams === "5.5" && r.sugarText === "22.5 جم" && r.steepText === "15 – 20 دقيقة", "new tea calculates");
ok(core.shareText(r).includes("شاي التجربة (OP1)"), "new tea share text");

// رفض البيانات الغلط.
const bad = (mutate, why) => { const c = JSON.parse(JSON.stringify(base)); mutate(c); ok(!Catalog.validate(c).ok, why); };
bad((c) => { c.version = 2; }, "version");
bad((c) => { c.simple[0].id = "Bad Id"; }, "id format");
bad((c) => { c.simple[1].id = c.simple[0].id; }, "duplicate id");
bad((c) => { c.branded[1].brandId = c.branded[0].brandId; }, "duplicate brand");
bad((c) => { c.simple[0].cardName = ""; }, "empty name");
bad((c) => { c.simple[0].cardName = "<img src=x>"; }, "markup in name");
bad((c) => { c.simple[0].brand = "x".repeat(41); }, "long name");
bad((c) => { c.simple[0].teaPerLiterByTaste.normal = 0; }, "zero tea");
bad((c) => { c.simple[0].teaPerLiterByTaste.medium = "abc"; }, "non-numeric tea");
bad((c) => { c.simple[0].sugarPerLiterByTaste.normal = -1; }, "negative sugar");
bad((c) => { c.simple[0].steepMinutes = { min: 30, max: 20 }; }, "steep order");
bad((c) => { c.simple[0].steepMinutes = { min: 0, max: 20 }; }, "steep zero");
bad((c) => { c.simple[0].image = "../../etc/passwd"; }, "image path");
bad((c) => { c.simple[0].image = "javascript:alert(1)"; }, "image scheme");
bad((c) => { c.branded[0].items = []; }, "empty brand");
bad((c) => { c.simple = []; c.branded = []; }, "empty catalog");
ok(!Catalog.validate(null).ok && !Catalog.validate([]).ok && !Catalog.validate("x").ok, "non-object");
// حقول غير معروفة تنشال.
const extra = JSON.parse(JSON.stringify(base)); extra.simple[0].evil = "<script>"; extra.hack = 1;
const cleaned = Catalog.validate(extra);
ok(cleaned.ok && !("evil" in cleaned.data.simple[0]) && !("hack" in cleaned.data), "unknown fields stripped");
ok(Catalog.imageUrl("upload:abc123.webp", "tins") === "/api/image/tins/abc123.webp" && Catalog.imageUrl("Nahrin.webp", "teas") === "img/teas/Nahrin.webp", "image urls");
console.log({ catalogChecks: checks, failures: 0 });
