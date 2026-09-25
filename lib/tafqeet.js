
// تفقيط: a whole number of dinars in Arabic words, as written on Iraqi
// receipts: "فقط مليون وستمائة ألف دينار عراقي لا غير".
// Handles 0 … 999,999,999,999 (masculine counting, since دينار is).

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر",
  "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة",
  "سبعمائة", "ثمانمائة", "تسعمائة"];

// [singular, dual, plural (3–10)] for each power of a thousand.
const SCALES = [
  null,
  ["ألف", "ألفان", "آلاف"],
  ["مليون", "مليونان", "ملايين"],
  ["مليار", "ملياران", "مليارات"]
];

// 1–999. `beforeNoun`: the group is followed by a scale word, where
// "مائتان" and "اثنا عشر" take their construct forms.
function groupWords(n, beforeNoun) {
  const parts = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;

  if (hundreds) {
    parts.push(hundreds === 2 && beforeNoun && !rest ? "مائتا" : HUNDREDS[hundreds]);
  }

  if (rest >= 20) {
    const one = rest % 10;
    parts.push(one ? `${ONES[one]} و${TENS[Math.floor(rest / 10)]}` : TENS[Math.floor(rest / 10)]);
  } else if (rest >= 10) {
    parts.push(TEENS[rest - 10]);
  } else if (rest) {
    parts.push(ONES[rest]);
  }

  return parts.join(" و");
}

export function numberToArabicWords(value) {
  const n = Math.round(Number(value));

  if (!Number.isFinite(n) || n < 0 || n > 999999999999) return "";
  if (n === 0) return "صفر";

  const groups = [];
  let rest = n;

  for (let scale = 0; rest > 0; scale++) {
    const group = rest % 1000;
    rest = Math.floor(rest / 1000);

    if (!group) continue;

    if (scale === 0) {
      groups.unshift(groupWords(group, false));
      continue;
    }

    const [one, two, few] = SCALES[scale];

    if (group === 1) groups.unshift(one); // ألف, not "واحد ألف"
    else if (group === 2) groups.unshift(two); // ألفان
    else if (group <= 10) groups.unshift(`${groupWords(group, true)} ${few}`); // ثلاثة آلاف
    else groups.unshift(`${groupWords(group, true)} ${one}`); // خمسة عشر ألف، مائتا ألف
  }

  return groups.join(" و");
}

export function amountInWords(value) {
  const words = numberToArabicWords(value);
  return words ? `فقط ${words} دينار عراقي لا غير` : "";
}
