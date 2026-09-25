
// Calendar days as "YYYY-MM-DD" strings, stored as UTC midnight in
// @db.Date columns. "Today" is always Iraq's today: the server runs in
// another time zone, and around midnight the two disagree.

const IRAQ_TIME_ZONE = "Asia/Baghdad";

export function iraqToday(now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IRAQ_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;

  const date = new Date(value + "T00:00:00.000Z");

  return date.toISOString().slice(0, 10) === value ? date : null;
}

export function dayString(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function addDays(day, count) {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + count);
  return dayString(date);
}

// 0 = Sunday … 6 = Saturday.
export function weekday(day) {
  return parseDay(day).getUTCDay();
}

// The Iraqi school week runs Sunday to Thursday.
export function isWeekend(day) {
  const d = weekday(day);
  return d === 5 || d === 6;
}

export function schoolWeek(day) {
  const sunday = addDays(day, -weekday(day));
  return [0, 1, 2, 3, 4].map((offset) => addDays(sunday, offset));
}

export const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
