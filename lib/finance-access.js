
// المعاون (role DEPUTY): an admin chooses, per tab of المالية, whether
// they see it (READ) and may also change it (WRITE). Stored as JSON in
// User.financeAccess ({ "salaries": "WRITE", "summary": "READ" }); a tab
// not listed is hidden. Admins have every tab. Shared by the server
// (pages, API routes) and the users page.

export const FINANCE_TABS = {
  summary: "الملخص",
  salaries: "رواتب الموظفين",
  general: "مصاريف عامة",
  fixed: "مصاريف ثابتة",
  box: "الصندوق والشركاء"
};

export const ACCESS_LEVELS = { READ: "قراءة فقط", WRITE: "قراءة وكتابة" };

// The tab each Expense category is kept under (SALARY: the old lump sums,
// listed with the salaries).
export const CATEGORY_TAB = {
  GENERAL: "general",
  ASSET: "fixed",
  WITHDRAWAL: "box",
  INCOME: "box",
  HANDOVER: "box",
  SALARY: "salaries"
};

// The stored value → { tab: level }, keeping only known tabs and levels.
export function parseFinanceAccess(value) {
  let raw = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(([tab, level]) => Object.hasOwn(FINANCE_TABS, tab) && Object.hasOwn(ACCESS_LEVELS, level))
  );
}

// What a user may do with a tab: "WRITE", "READ" or null.
export function financeLevel(user, tab) {
  if (user?.role === "ADMIN") return "WRITE";
  if (user?.role !== "DEPUTY") return null;
  return parseFinanceAccess(user.financeAccess)[tab] ?? null;
}

export function canFinance(user, tab, write = false) {
  const level = financeLevel(user, tab);
  return write ? level === "WRITE" : Boolean(level);
}

// A معاون's tabs of المالية: { tab: "READ" | "WRITE" } → { value } (the
// JSON to store, null for none) or { error, field }.
export function checkFinanceAccess(value) {
  if (value === undefined) return { value: undefined };
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    !Object.entries(value).every(([tab, level]) => Object.hasOwn(FINANCE_TABS, tab) && (!level || Object.hasOwn(ACCESS_LEVELS, level)))
  ) {
    return { error: "صلاحيات المالية غير صالحة.", field: "financeAccess" };
  }
  const access = parseFinanceAccess(value);
  return { value: Object.keys(access).length ? JSON.stringify(access) : null };
}
