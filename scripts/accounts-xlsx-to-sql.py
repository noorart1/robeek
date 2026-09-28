"""Turn the centre's accounts workbook (RubikAccountsFile.xlsx) into SQL.

    python scripts/accounts-xlsx-to-sql.py RubikAccountsFile.xlsx out.sql [--replace]
    mysql --default-character-set=utf8mb4 <db> < out.sql

Sheets → tables:
    المصاريف العامة        → Expense GENERAL
    مصاريف الأصول          → Expense ASSET
    مبيعات المركز          → Expense INCOME
    رواتب الموظفين         → Staff (missing names only) + Salary per month;
                              lump sums → Expense SALARY; contractor, daily
                              wages, donations → Expense GENERAL
    تسليم الادارة-علي      → Expense HANDOVER
    سحب ابوحسن/البراق/ابوحوراء → Expense WITHDRAWAL
«الرئيسية» and «تحليل المصروفات» hold only formulas and are skipped.

Dates: Excel read many "day/month" entries as month/day (12/7 became
7 December). A date that could be either is resolved against the rows
before it (the sheets are in date order), a missing date takes the row
before's, and every such guess is written into the row's notes with ⚠,
so nothing is corrected silently. The report lists them too.

Re-runnable: without --replace the SQL inserts nothing when Expense or
Salary already has rows; --replace deletes both tables first (manual
entries included). Staff are only ever added, never deleted.
The workbook holds personal data: delete out.sql after use.
"""

import datetime as dt
import re
import sys

import openpyxl

SEASON = (dt.date(2026, 5, 1), dt.date(2026, 9, 28))
MONTHS = {"السادس": 6, "السابع": 7, "الثامن": 8, "التاسع": 9, "العاشر": 10}
NOT_STAFF = ("المتعهد", "يوميات", "صدقة")

report = []


def in_season(d):
    return SEASON[0] <= d <= SEASON[1]


def resolve(value, prev):
    """(date, warning or None) for a date cell, given the previous row's date."""
    if value is None:
        return prev, "بدون تاريخ في الملف، أُخذ تاريخ السطر السابق"

    if isinstance(value, (int, float)):  # an Excel serial number
        value = dt.datetime(1899, 12, 30) + dt.timedelta(days=int(value))

    if isinstance(value, dt.datetime):
        d = value.date()
        options = [d]
        if d.day <= 12 and d.day != d.month:
            options.append(dt.date(d.year, d.day, d.month))
        options = [o for o in options if in_season(o)] or [d]
        after = [o for o in options if prev is None or o >= prev]
        pick = min(after or options, key=lambda o: abs((o - (prev or o)).days))
        if pick != d:
            return pick, f"التاريخ في الملف {d:%Y-%m-%d}، فُسّر {pick:%d/%m/%Y} (اليوم والشهر مقلوبان)"
        return pick, None

    # Text, always day first: "21-6", "13-7-2026", "19l7l2026", "28/6/2026".
    parts = [int(p) for p in re.split(r"[^0-9]+", str(value)) if p]
    if len(parts) >= 2:
        day, month = parts[0], parts[1]
        year = parts[2] if len(parts) > 2 else 2026
        warning = None
        if year != 2026:
            warning = f"السنة في الملف {year}، اعتُبرت 2026"
            year = 2026
        try:
            return dt.date(year, month, day), warning
        except ValueError:
            pass
    return prev, f"تاريخ غير مفهوم في الملف «{value}»، أُخذ تاريخ السطر السابق"


def sql(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, dt.date):
        return f"'{value.isoformat()}'"
    return "'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


def text(value):
    value = str(value).strip() if value is not None else ""
    return value or None


def notes(*parts):
    return " — ".join(p for p in (text(p) for p in parts) if p) or None


expenses, staff, salaries = [], {}, []


def expense(sheet, row, date, category, item, amount, note):
    expenses.append((date, category, item, amount, note))
    if note and "⚠" in note:
        report.append(f"  {sheet} row {row}: {note[note.index('⚠'):]}")


def ledger_sheet(ws, sheet, category, date_col, item_col, amount_col, note_col, default_item):
    prev = None
    for r in range(3, ws.max_row + 1):
        amount = ws[f"{amount_col}{r}"].value
        if not isinstance(amount, (int, float)) or not amount:
            continue
        date, warning = resolve(ws[f"{date_col}{r}"].value, prev)
        prev = date
        item = text(ws[f"{item_col}{r}"].value) if item_col else None
        note = notes(ws[f"{note_col}{r}"].value if note_col else None,
                     f"⚠ {warning}" if warning else None)
        expense(sheet, r, date, category, item or default_item, amount, note)


def salary_sheet(ws):
    month = None
    for r in range(3, 86):
        a, name, title = ws[f"A{r}"].value, text(ws[f"B{r}"].value), text(ws[f"C{r}"].value)
        period, amount, remark = ws[f"D{r}"].value, ws[f"H{r}"].value, ws[f"K{r}"].value

        if name and name.startswith("الرواتب للشهر"):
            month = next(m for word, m in MONTHS.items() if word in name)
            continue
        if not isinstance(amount, (int, float)) or not amount:
            continue

        # A dated "رواتب" row: one payment for everyone, no breakdown.
        if isinstance(a, dt.datetime):
            date, warning = resolve(a, None)
            expense("رواتب الموظفين", r, date, "SALARY", "رواتب", amount,
                    notes("مجموع الرواتب بدون تفصيل حسب الموظف", remark, f"⚠ {warning}" if warning else None))
            continue

        if not name:
            report.append(f"  رواتب الموظفين row {r}: amount {amount} without a name, skipped")
            continue
        if any(s[0] == name and s[1] == f"2026-{month:02d}" for s in salaries):
            report.append(f"  رواتب الموظفين row {r}: {name} twice in month {month}, second skipped")
            continue

        period_text = period.strftime("%d/%m/%Y") if isinstance(period, dt.datetime) else period
        if any(word in name for word in NOT_STAFF):
            expense("رواتب الموظفين", r, dt.date(2026, month, 1), "GENERAL", name, amount,
                    notes(f"من ورقة الرواتب، الشهر {month}", period_text, remark))
            continue

        job, shift = title, None
        for word, code in (("صباحي", "MORNING"), ("مسائي", "EVENING")):
            if title and title.endswith(word):
                job, shift = title[: -len(word)].strip(" -"), code
        staff.setdefault(name, (job, shift, bool(title)))
        salaries.append((name, f"2026-{month:02d}", amount, notes(period_text, remark)))

    # Names listed with a title but never paid yet still belong to the roster.
    for r in range(3, 86):
        name, title = text(ws[f"B{r}"].value), text(ws[f"C{r}"].value)
        if name and title and not any(word in name for word in NOT_STAFF):
            job, shift = title, None
            for word, code in (("صباحي", "MORNING"), ("مسائي", "EVENING")):
                if title.endswith(word):
                    job, shift = title[: -len(word)].strip(" -"), code
            staff.setdefault(name, (job, shift, True))


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    wb = openpyxl.load_workbook(sys.argv[1])
    replace = "--replace" in sys.argv

    ledger_sheet(wb["المصاريف العامة"], "المصاريف العامة", "GENERAL", "B", "C", "D", "E", "مصروف")
    ledger_sheet(wb["مصاريف الأصول"], "مصاريف الأصول", "ASSET", "B", "C", "D", "E", "أصل")
    ledger_sheet(wb["مبيعات المركز"], "مبيعات المركز", "INCOME", "B", "C", "D", "E", "مبيعات المركز")
    ledger_sheet(wb["تسليم الادارة-علي"], "تسليم الادارة-علي", "HANDOVER", "B", None, "C", "E", "تسليم الإدارة — علي")
    for sheet, who in (("سحب ابوحسن", "ابوحسن"), ("سحب البراق", "البراق"), ("سحب ابوحوراء", "ابوحوراء")):
        ledger_sheet(wb[sheet], sheet, "WITHDRAWAL", "B", None, "C", "D", f"سحب {who}")
    salary_sheet(wb["رواتب الموظفين"])

    out = ["-- Generated by scripts/accounts-xlsx-to-sql.py. Holds personal data: delete after use.",
           "SET NAMES utf8mb4;", "START TRANSACTION;"]
    if replace:
        out += ["DELETE FROM `Salary`;", "DELETE FROM `Expense`;"]
    out.append("SET @empty = (SELECT COUNT(*) FROM `Expense`) + (SELECT COUNT(*) FROM `Salary`) = 0;")

    for name, (job, shift, active) in staff.items():
        out.append(
            "INSERT INTO `Staff` (`name`, `job`, `shift`, `isActive`, `updatedAt`) "
            f"SELECT {sql(name)}, {sql(job)}, {sql(shift)}, {int(active)}, NOW(3) FROM DUAL "
            f"WHERE NOT EXISTS (SELECT 1 FROM `Staff` WHERE `name` = {sql(name)});"
        )
    for name, month, amount, note in salaries:
        out.append(
            "INSERT INTO `Salary` (`staffId`, `month`, `baseSalary`, `notes`, `updatedAt`) "
            f"SELECT `id`, {sql(month)}, {sql(amount)}, {sql(note[:500] if note else None)}, NOW(3) "
            f"FROM `Staff` WHERE `name` = {sql(name)} AND @empty ORDER BY `id` LIMIT 1;"
        )
    for date, category, item, amount, note in expenses:
        out.append(
            "INSERT INTO `Expense` (`date`, `category`, `item`, `amount`, `notes`, `updatedAt`) "
            f"SELECT {sql(date)}, {sql(category)}, {sql(item[:191])}, {sql(amount)}, {sql(note)}, NOW(3) "
            "FROM DUAL WHERE @empty;"
        )
    out.append("COMMIT;")

    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")

    totals = {}
    for _, category, _, amount, _ in expenses:
        totals[category] = totals.get(category, 0) + amount
    print(f"staff (added if missing): {len(staff)}, salaries: {len(salaries)} = {sum(s[2] for s in salaries):,.0f}")
    for category, amount in totals.items():
        print(f"{category:<10} {sum(1 for e in expenses if e[1] == category):>3} rows = {amount:,.0f}")
    print(f"dates guessed or corrected ({len(report)}), each noted with ⚠:")
    print("\n".join(report))


if __name__ == "__main__":
    main()
