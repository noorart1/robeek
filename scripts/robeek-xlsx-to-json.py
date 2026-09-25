"""Extract the Robeek enrollment workbook into plain JSON.

    python scripts/robeek-xlsx-to-json.py robeek_students_data.xlsx out.json

Only reads cells; every interpretation (names, phones, fees, siblings)
happens in scripts/import-robeek.js. The output contains children's
personal data: keep it out of the repository and delete it after use.
"""

import json
import re
import sys

import openpyxl

SECTION_SHEET = re.compile(r"(صباحي|مسائي)\s+([A-F])")
SHIFTS = {"صباحي": "MORNING", "مسائي": "EVENING"}


def text(value):
    if value is None:
        return None
    value = re.sub(r"\s+", " ", str(value)).strip()
    return value or None


def read_sections(workbook):
    sections = []

    for sheet in workbook.worksheets:
        match = SECTION_SHEET.search(sheet.title)
        if not match:
            continue

        teacher = text(sheet["D1"].value)
        if teacher:
            teacher = re.sub(r"^مرشدتهم\s*", "", teacher) or None

        rows = []
        for r in range(4, sheet.max_row + 1):
            cells = [sheet.cell(r, c).value for c in range(1, 16)]
            if text(cells[7]) == "المجموع" or text(cells[6]) == "المجموع":
                break
            name = text(cells[2])
            if not name:
                continue
            rows.append({
                "row": r,
                "seq": cells[1],
                "name": name,
                "birth": cells[3],
                "address": text(cells[4]),
                "fatherPhone": cells[5],
                "motherPhone": cells[6],
                "attendance": text(cells[7]),
                "fee": cells[8],
                "paid": cells[9],
                "period": text(cells[10]),
                "curriculum": cells[11],
                "note": text(cells[12]),
                "extra": [t for t in (text(v) for v in cells[13:]) if t],
            })

        sections.append({
            "sheet": sheet.title,
            "shift": SHIFTS[match[1]],
            "section": match[2],
            "teacher": teacher,
            "students": rows,
        })

    return sections


def read_lines(workbook):
    sheet = workbook["الخطوط"]
    lines, current = [], None

    for r in range(1, sheet.max_row + 1):
        label = sheet.cell(r, 2).value
        if isinstance(label, str) and label.strip().startswith("خط "):
            match = re.match(r"خط\s+(.*?)\s*(0?7\d{9})?\s*$", label.strip())
            current = {
                "name": match[1].strip(),
                "driverPhone": match[2],
                "shift": "MORNING",
                "students": [],
            }
            lines.append(current)
        elif current and isinstance(label, int) and text(sheet.cell(r, 3).value):
            current["students"].append({
                "order": label,
                "name": text(sheet.cell(r, 3).value),
                "section": text(sheet.cell(r, 4).value),
                "address": text(sheet.cell(r, 5).value),
                "fatherPhone": sheet.cell(r, 6).value,
                "motherPhone": sheet.cell(r, 7).value,
            })

    return lines


def main(source, target):
    workbook = openpyxl.load_workbook(source, data_only=True)

    title = text(workbook["الرئيسية"]["D2"].value) or ""
    year = re.search(r"(\d{4})\s*-\s*(\d{4})", title)

    data = {
        "academicYear": f"{year[1]}-{year[2]}" if year else None,
        "sections": read_sections(workbook),
        "lines": read_lines(workbook),
    }

    with open(target, "w", encoding="utf-8") as out:
        json.dump(data, out, ensure_ascii=False, indent=1)

    count = sum(len(s["students"]) for s in data["sections"])
    print(f"{len(data['sections'])} sections, {count} students, "
          f"{len(data['lines'])} transport lines -> {target}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
