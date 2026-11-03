/* كتالوج خدرة شاي — القيم لكل 1 لتر ماء. لا تعدّل هذه القيم إلا عند تحديث المقادير المعتمدة. */
(function (root) {
'use strict';
const SIMPLE_TEAS = [
  { id: "nahrain-op", teaType: "OP", brand: "شاي النهرين", cardName: "النهرين", image: "Nahrin.webp", featured: true, teaPerLiterByTaste: { normal: 12, medium: 12, nosugar: 12 }, sugarPerLiterByTaste: { normal: 50, medium: 55, nosugar: 0 }, steepMinutes: { min: 20, max: 25 } },
  { id: "naif-op1", teaType: "OP1", brand: "شاي نايف", cardName: "نايف", image: "Naif_OP1.webp", featured: true, teaPerLiterByTaste: { normal: 14, medium: 14, nosugar: 14 }, sugarPerLiterByTaste: { normal: 50, medium: 55, nosugar: 0 }, steepMinutes: { min: 30, max: 35 } },
  { id: "khabt-bop1", teaType: "BOP1", brand: "خبت", cardName: "خبت", image: "Khabt.webp", featured: true, teaPerLiterByTaste: { normal: 12, medium: 13, nosugar: 12 }, sugarPerLiterByTaste: { normal: 50, medium: 55, nosugar: 0 }, steepMinutes: { min: 25, max: 30 } },
  { id: "azzawi-opa", teaType: "OPA", brand: "عزاوي", cardName: "عزاوي", image: "Azzawi_OPA.webp", featured: true, teaPerLiterByTaste: { normal: 13, medium: 13.5, nosugar: 13 }, sugarPerLiterByTaste: { normal: 50, medium: 55, nosugar: 0 }, steepMinutes: { min: 20, max: 25 } },

  { id: "sangil", teaType: "", brand: "سنقيل", cardName: "سنقيل", image: "Sangel.webp", teaPerLiterByTaste: { normal: 11.5, medium: 12.5, nosugar: 11.5 }, sugarPerLiterByTaste: { normal: 50, medium: 55, nosugar: 0 }, steepMinutes: { min: 30, max: 30 } },
  { id: "hout", teaType: "", brand: "الحوت", cardName: "الحوت", image: "Alhot.webp", teaPerLiterByTaste: { normal: 10.5, medium: 10.5, nosugar: 9.5 }, sugarPerLiterByTaste: { normal: 53, medium: 60, nosugar: 0 }, steepMinutes: { min: 25, max: 25 } },
  { id: "kuwait-opa", teaType: "OPA", brand: "واردات الكويت", cardName: "واردات الكويت", image: "Wardat_OPA.webp", teaPerLiterByTaste: { normal: 13, medium: 13.5, nosugar: 13 }, sugarPerLiterByTaste: { normal: 47, medium: 52, nosugar: 0 }, steepMinutes: { min: 20, max: 25 } },
  { id: "kuwait-fbop1", teaType: "FBOP1", brand: "واردات الكويت", cardName: "واردات الكويت", image: "Wardat_FBOP1.webp", teaPerLiterByTaste: { normal: 13, medium: 13.5, nosugar: 13 }, sugarPerLiterByTaste: { normal: 47, medium: 52, nosugar: 0 }, steepMinutes: { min: 20, max: 25 } },
  { id: "999-opa", teaType: "OPA", brand: "999", cardName: "999", image: "999_OPA.webp", teaPerLiterByTaste: { normal: 12.5, medium: 13.5, nosugar: 12.5 }, sugarPerLiterByTaste: { normal: 50, medium: 53, nosugar: 0 }, steepMinutes: { min: 20, max: 25 } },

  { id: "golden-chair", teaType: "", brand: "الكرسي الذهبي", cardName: "الكرسي الذهبي", image: "golden-chair.webp", teaPerLiterByTaste: { normal: 11.5, medium: 12.5, nosugar: 11.5 }, sugarPerLiterByTaste: { normal: 50, medium: 60, nosugar: 0 }, steepMinutes: { min: 25, max: 30 } },
  { id: "summan-hadid-dayri", teaType: "", brand: "الصمان حديد دائري", cardName: "الصمان حديد دائري", image: "summan.webp", teaPerLiterByTaste: { normal: 12.5, medium: 13.5, nosugar: 12.5 }, sugarPerLiterByTaste: { normal: 50, medium: 50, nosugar: 0 }, steepMinutes: { min: 30, max: 30 } },
  { id: "horse-head", teaType: "", brand: "رأس الحصان", cardName: "رأس الحصان", image: "horse-head.webp", teaPerLiterByTaste: { normal: 12.5, medium: 13.5, nosugar: 12.5 }, sugarPerLiterByTaste: { normal: 50, medium: 55, nosugar: 0 }, steepMinutes: { min: 20, max: 25 } },
  { id: "khadir-fop1", teaType: "FOP1", brand: "خدير", cardName: "خدير", image: "khadir-FOP1.webp", teaPerLiterByTaste: { normal: 12, medium: 12, nosugar: 12 }, sugarPerLiterByTaste: { normal: 50, medium: 50, nosugar: 0 }, steepMinutes: { min: 25, max: 30 } },
  { id: "khadir-op1", teaType: "OP1", brand: "خدير", cardName: "خدير", image: "khadir-OP1.webp", teaPerLiterByTaste: { normal: 12, medium: 12, nosugar: 12 }, sugarPerLiterByTaste: { normal: 50, medium: 50, nosugar: 0 }, steepMinutes: { min: 25, max: 30 } },
  { id: "alghada", teaType: "", brand: "الغضا", cardName: "الغضا", image: "alghada.webp", teaPerLiterByTaste: { normal: 11, medium: 11.5, nosugar: 11 }, sugarPerLiterByTaste: { normal: 52, medium: 55, nosugar: 0 }, steepMinutes: { min: 20, max: 25 } },
  { id: "alqimah", teaType: "", brand: "القمة", cardName: "القمة", image: "alqimah.webp", teaPerLiterByTaste: { normal: 9.5, medium: 10.5, nosugar: 9.5 }, sugarPerLiterByTaste: { normal: 50, medium: 53, nosugar: 0 }, steepMinutes: { min: 20, max: 25 } },
  { id: "twining", teaType: "", brand: "تويننجز", cardName: "تويننجز", image: "twining.webp", teaPerLiterByTaste: { normal: 10.5, medium: 12, nosugar: 10.5 }, sugarPerLiterByTaste: { normal: 50, medium: 60, nosugar: 0 }, steepMinutes: { min: 20, max: 30 } },
  { id: "511", teaType: "", brand: "511", cardName: "511", image: "511.webp", teaPerLiterByTaste: { normal: 12.5, medium: 13.5, nosugar: 12.5 }, sugarPerLiterByTaste: { normal: 50, medium: 53, nosugar: 0 }, steepMinutes: { min: 25, max: 25 } },
  { id: "dasman-hadid", teaType: "حديد", brand: "دسمان", cardName: "دسمان", image: "dasman.webp", teaPerLiterByTaste: { normal: 10, medium: 11, nosugar: 10 }, sugarPerLiterByTaste: { normal: 50, medium: 55, nosugar: 0 }, steepMinutes: { min: 25, max: 30 } },
  { id: "qualitea", teaType: "", brand: "كوالتي", cardName: "كوالتي", image: "qualitea.webp", teaPerLiterByTaste: { normal: 13, medium: 13.5, nosugar: 13 }, sugarPerLiterByTaste: { normal: 50, medium: 53, nosugar: 0 }, steepMinutes: { min: 20, max: 25 } },
  { id: "abutair", teaType: "", brand: "ابو طير", cardName: "ابو طير", image: "abutair.webp", teaPerLiterByTaste: { normal: 9.5, medium: 10.5, nosugar: 9.5 }, sugarPerLiterByTaste: { normal: 50, medium: 55, nosugar: 0 }, steepMinutes: { min: 25, max: 25 } },
  { id: "bn-mngash", teaType: "", brand: "بن منقاش", cardName: "بن منقاش", image: "bn-mngash.webp", teaPerLiterByTaste: { normal: 13, medium: 14, nosugar: 13 }, sugarPerLiterByTaste: { normal: 48, medium: 58, nosugar: 0 }, steepMinutes: { min: 20, max: 25 } },
  { id: "alawlin", teaType: "", brand: "الأولين", cardName: "الأولين", image: "alawlin.webp", teaPerLiterByTaste: { normal: 12.5, medium: 13, nosugar: 12.5 }, sugarPerLiterByTaste: { normal: 50, medium: 53, nosugar: 0 }, steepMinutes: { min: 25, max: 25 } },
  { id: "tulay-opa", teaType: "OPA", brand: "تولاي", cardName: "تولاي", image: "tulay-OPA.webp", teaPerLiterByTaste: { normal: 13, medium: 14, nosugar: 13 }, sugarPerLiterByTaste: { normal: 60, medium: 60, nosugar: 0 }, steepMinutes: { min: 20, max: 25 } }
];

const BRANDED_TEAS = [
  {
    brandId: "munais",
    brand: "المنيس",
    items: [
      { id: "munais-op1", teaType: "OP1", cardName: "المنيس", image: "Sahmin_op1.webp", teaPerLiterByTaste: { normal: 12.5, medium: 13.5, nosugar: 11.5 }, sugarPerLiterByTaste: { normal: 50, medium: 55, nosugar: 0 }, steepMinutes: { min: 25, max: 30 } },
      { id: "munais-bop1", teaType: "BOP1", cardName: "المنيس", image: "Sahmin_BOP1.webp", teaPerLiterByTaste: { normal: 12.5, medium: 13.5, nosugar: 11.5 }, sugarPerLiterByTaste: { normal: 50, medium: 55, nosugar: 0 }, steepMinutes: { min: 25, max: 30 } },
      { id: "munais-fbop1", teaType: "FBOP1", cardName: "المنيس", image: "mnes-gold.webp", teaPerLiterByTaste: { normal: 12.5, medium: 13.5, nosugar: 11.5 }, sugarPerLiterByTaste: { normal: 50, medium: 55, nosugar: 0 }, steepMinutes: { min: 25, max: 30 } }
    ]
  },
  {
    brandId: "wazah",
    brand: "الوزه",
    items: [
      { id: "wazah-op1", teaType: "OP1", cardName: "الوزه", image: "wazah-OP1.webp", teaPerLiterByTaste: { normal: 12.5, medium: 13.5, nosugar: 12.5 }, sugarPerLiterByTaste: { normal: 50, medium: 55, nosugar: 0 }, steepMinutes: { min: 25, max: 30 } },
      { id: "wazah-fbob1", teaType: "FBOB1", cardName: "الوزه", image: "wazah-FBOB1.webp", teaPerLiterByTaste: { normal: 12, medium: 12, nosugar: 12 }, sugarPerLiterByTaste: { normal: 50, medium: 50, nosugar: 0 }, steepMinutes: { min: 25, max: 30 } }
    ]
  }
];

root.KhadraData = Object.freeze({ SIMPLE_TEAS, BRANDED_TEAS });
})(typeof globalThis !== 'undefined' ? globalThis : this);
