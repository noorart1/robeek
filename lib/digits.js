
// Arabic-Indic (٠-٩) and Persian (۰-۹) digits, as typed on Arabic and
// Persian keyboards, converted to the ASCII digits the database stores.

export function toWesternDigits(value) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) =>
    String(digit.charCodeAt(0) & 0xf)
  );
}
