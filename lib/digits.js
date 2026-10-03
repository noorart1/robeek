
// Arabic-Indic (٠-٩) and Persian (۰-۹) digits, as typed on Arabic and
// Persian keyboards, converted to the ASCII digits the database stores.

export function toWesternDigits(value) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) =>
    String(digit.charCodeAt(0) & 0xf)
  );
}

// A money amount as typed: "1,600,000", "١٬٦٠٠٬٠٠٠", "۱۶۰۰۰۰۰" or "1600000"
// → 1600000. Returns null for anything that is not a non-negative number
// with at most two decimals (the database keeps two: more would be
// rounded silently), e.g. "1.600.000" or "12.345".

export function parseAmount(value) {
  const text = toWesternDigits(String(value ?? ""))
    .replace(/[\s,٬،]/g, "")
    .replace(/٫/g, ".");

  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;

  const number = Number(text);

  return number <= 1e12 ? number : null;
}
