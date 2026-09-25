
import { toWesternDigits } from "./digits";

// Fold the spelling variants people use interchangeably when typing
// Arabic names, so that searching "احمد" finds "أحمد", "فاطمه" finds
// "فاطمة", and a Persian keyboard's ی/ک match Arabic ي/ك.

export function normalizeArabic(text) {
  return toWesternDigits(String(text ?? ""))
    .replace(/[ً-ٰٟـ]/g, "") // tashkeel, tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىیئ]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ک/g, "ك")
    .toLowerCase();
}

// True when every word of the query appears in the text, ignoring the
// variants above; phone numbers also match with or without spaces.

export function matchesSearch(text, query) {
  const words = normalizeArabic(query).split(/\s+/).filter(Boolean);

  if (words.length === 0) return true;

  const haystack = normalizeArabic(text);
  const compact = haystack.replace(/[\s()-]/g, "");

  return words.every(
    (word) => haystack.includes(word) || compact.includes(word)
  );
}

// "2019-03-07" (or a full ISO timestamp) → "07/03/2019", the day-first
// order used in Iraq.

export function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));

  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}
