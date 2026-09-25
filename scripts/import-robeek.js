
// Import the Robeek enrollment workbook (as JSON from
// scripts/robeek-xlsx-to-json.py) into the database.
//
//   node scripts/import-robeek.js data.json            # dry run: report only
//   node scripts/import-robeek.js data.json --replace  # wipe and import
//
// --replace deletes every student, parent, enrollment, payment, class,
// academic year and transport line first. Take a database backup before
// running it anywhere that matters.
//
// Nothing questionable is silently "fixed": each problem is written to the
// child's reviewNote, shown in the table as needing review.

const fs = require("fs");
const prisma = require("../lib/prisma");

const [, , file, flag] = process.argv;
const REPLACE = flag === "--replace";

if (!file) {
  console.error("Usage: node scripts/import-robeek.js data.json [--replace]");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));

// ---------------------------------------------------------------- names

// Parts of compound Arabic names that never stand alone.
const JOIN_WITH_NEXT = new Set(["عبد", "ابو", "أبو", "ابا", "أبا", "ذو"]);
const JOIN_WITH_PREVIOUS = new Set(["الدين", "العابدين", "الزهراء", "الهدى", "الله", "الرحمن"]);

// "فيروز حسين عبد العظيم" → { first: فيروز, father: حسين, grandfather: عبد العظيم }.
// Anything after the third part (a 4th name or a laqab like النجفي) goes to
// lastName, so joining the parts always reproduces the original text.
function splitName(full) {
  const words = full.split(" ");
  const parts = [];

  for (let i = 0; i < words.length; i++) {
    let part = words[i];

    while (JOIN_WITH_NEXT.has(part.split(" ").pop()) && i + 1 < words.length) {
      part += " " + words[++i];
    }
    while (i + 1 < words.length && JOIN_WITH_PREVIOUS.has(words[i + 1])) {
      part += " " + words[++i];
    }

    parts.push(part);
  }

  // "محمد رضا" / "محمد باقر" are one name, but only unambiguous when the
  // full name would otherwise have more than three parts.
  if (parts.length > 3) {
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i] === "محمد" && ["رضا", "باقر"].includes(parts[i + 1])) {
        parts.splice(i, 2, `محمد ${parts[i + 1]}`);
        break;
      }
    }
  }

  return {
    first: parts[0],
    father: parts[1] || null,
    grandfather: parts[2] || null,
    last: parts.slice(3).join(" ") || null
  };
}

const fold = (s) =>
  String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");

// --------------------------------------------------------------- phones

// Excel stored numbers as integers, dropping the leading 0: 7823656534.
// Iraqi mobiles are 07XXXXXXXXX (11 digits).
function phone(value, label, problems) {
  if (value === null || value === undefined || value === "") return null;

  const digits = String(value).replace(/\D/g, "");

  if (!digits) {
    problems.push(`${label} في الملف: «${value}»`);
    return null;
  }

  const number = digits.startsWith("0") ? digits : "0" + digits;

  if (!/^07\d{9}$/.test(number)) {
    problems.push(`${label} غير مكتمل (${number})`);
  }

  return number;
}

// -------------------------------------------------------- fees and dates

function amount(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function attendance(text) {
  const t = String(text || "").replace(/\s+/g, "");
  return {
    attendanceType: /موظف|موضف/.test(t) ? "EMPLOYEE" : /عادي/.test(t) ? "REGULAR" : null,
    paymentPlan: /سنوي/.test(t) ? "YEARLY" : /شهري/.test(t) ? "MONTHLY" : null
  };
}

// Morning sections started on 1 October, evening ones on 2 November.
const DEFAULT_START = { MORNING: "2025-10-01", EVENING: "2025-11-02" };

// "يوم المباشرة 10/14" (month/day) or "المباشرة 22-10" (day-month).
function startDate(texts, shift) {
  for (const text of texts) {
    const match = /المباشرة\s*(\d{1,2})\s*[/-]\s*(\d{1,2})/.exec(text || "");
    if (!match) continue;

    let [a, b] = [Number(match[1]), Number(match[2])];
    const [month, day] = a > 12 ? [b, a] : [a, b];
    const year = month >= 9 ? 2025 : 2026;

    return new Date(Date.UTC(year, month - 1, day));
  }

  return new Date(DEFAULT_START[shift] + "T00:00:00.000Z");
}

function birthYear(value, problems, notes) {
  if (typeof value === "number") return value;
  const match = /^(\d{4})/.exec(String(value || ""));
  if (!match) {
    problems.push("سنة الميلاد غير مسجلة");
    return null;
  }
  notes.push(`المواليد في الملف: ${value}`);
  return Number(match[1]);
}

// -------------------------------------------------------------- planning

const SHIFT_LETTER = { MORNING: "M", EVENING: "E" };
const SHIFT_LABEL = { MORNING: "صباحي", EVENING: "مسائي" };

const children = [];

for (const section of data.sections) {
  for (const row of section.students) {
    const problems = [];
    const notes = [row.note, ...row.extra].filter(Boolean);
    const name = splitName(row.name);

    const child = {
      source: `${SHIFT_LABEL[section.shift]} ${section.section} / ${row.seq}`,
      shift: section.shift,
      section: section.section,
      code: `${SHIFT_LETTER[section.shift]}-${section.section}-${String(row.seq).padStart(2, "0")}`,
      fullName: row.name,
      name,
      address: row.address,
      fatherPhone: phone(row.fatherPhone, "رقم الأب", problems),
      motherPhone: phone(row.motherPhone, "رقم الأم", problems),
      birthYear: birthYear(row.birth, problems, notes),
      ...attendance(row.attendance),
      fee: amount(row.fee),
      paid: amount(row.paid),
      period: row.period,
      curriculum: amount(row.curriculum),
      start: startDate(notes, section.shift),
      notes,
      problems
    };

    if (child.fee === null) problems.push("المبلغ الإجمالي غير مسجل");
    if (!row.attendance) problems.push("نوع الدوام غير مسجل");
    if (!child.fatherPhone && !child.motherPhone) problems.push("لا يوجد رقم هاتف");

    children.push(child);
  }
}

// Transport lines: match each rider to a child by section and father's
// phone, then by name (the line sheet sometimes shortens names).
const lines = data.lines.map((line) => ({ ...line, riders: [] }));

for (const line of lines) {
  for (const rider of line.students) {
    const problems = [];
    const fatherPhone = phone(rider.fatherPhone, "رقم الأب", []);
    const inSection = children.filter(
      (c) => c.shift === line.shift && c.section === rider.section
    );

    let child =
      inSection.find((c) => fold(c.fullName) === fold(rider.name)) ||
      (fatherPhone &&
        inSection.find(
          (c) => c.fatherPhone === fatherPhone && fold(c.fullName).startsWith(fold(rider.name).split(" ")[0])
        )) ||
      (() => {
        const prefix = inSection.filter((c) => fold(c.fullName).startsWith(fold(rider.name)));
        return prefix.length === 1 ? prefix[0] : null;
      })();

    if (!child) {
      // On a bus list but in no section sheet: keep them, flagged.
      child = {
        source: `خط ${line.name} / ${rider.order}`,
        shift: line.shift,
        section: rider.section,
        code: `${SHIFT_LETTER[line.shift]}-${rider.section}-L${rider.order}`,
        fullName: rider.name,
        name: splitName(rider.name),
        address: rider.address,
        fatherPhone,
        motherPhone: phone(rider.motherPhone, "رقم الأم", problems),
        birthYear: null,
        attendanceType: null,
        paymentPlan: null,
        fee: null,
        paid: null,
        period: null,
        curriculum: null,
        start: new Date(DEFAULT_START[line.shift] + "T00:00:00.000Z"),
        notes: [],
        problems: [
          `مسجل في خط النقل (${line.name}) فقط، وغير موجود في قائمة الشعبة ${rider.section}`,
          ...problems
        ]
      };
      children.push(child);
    } else {
      if (fold(child.fullName) !== fold(rider.name)) {
        child.notes.push(`الاسم في قائمة الخط: ${rider.name}`);
      }
      // Fill gaps from the bus list, never overwrite the section sheet.
      if (!child.address && rider.address) child.address = rider.address;
      if (!child.motherPhone && rider.motherPhone) {
        child.motherPhone = phone(rider.motherPhone, "رقم الأم", child.problems);
      }
    }

    child.line = line;
    child.lineOrder = rider.order;
    line.riders.push(child);
  }
}

// Possible duplicates: the same full name twice, or the same father's
// phone with the same child's first name.
for (let i = 0; i < children.length; i++) {
  for (let j = i + 1; j < children.length; j++) {
    const [a, b] = [children[i], children[j]];
    const sameName = fold(a.fullName) === fold(b.fullName);
    const sameFamilyAndFirst =
      a.fatherPhone && a.fatherPhone === b.fatherPhone && fold(a.name.first) === fold(b.name.first);

    if (sameName || sameFamilyAndFirst) {
      a.problems.push(`قد يكون مكرراً مع «${b.fullName}» (${b.source})`);
      b.problems.push(`قد يكون مكرراً مع «${a.fullName}» (${a.source})`);
    }
  }
}

// Parents: siblings share a record, recognised by phone number. A father
// phone shared by children whose fathers have different names is flagged
// rather than merged.
const fathers = new Map();
const mothers = new Map();

for (const child of children) {
  if (child.name.father) {
    const key = child.fatherPhone || `name:${child.code}`;
    const existing = fathers.get(key);

    if (existing && fold(existing.firstName) !== fold(child.name.father)) {
      child.problems.push(`رقم الأب مسجل أيضاً لأب باسم «${existing.firstName}»`);
      child.father = {
        firstName: child.name.father,
        lastName: [child.name.grandfather, child.name.last].filter(Boolean).join(" ") || null,
        phone: child.fatherPhone
      };
    } else {
      child.father =
        existing ||
        {
          firstName: child.name.father,
          lastName: [child.name.grandfather, child.name.last].filter(Boolean).join(" ") || null,
          phone: child.fatherPhone
        };
      fathers.set(key, child.father);
    }
  }

  if (child.motherPhone) {
    child.mother = mothers.get(child.motherPhone) || { firstName: null, lastName: null, phone: child.motherPhone };
    mothers.set(child.motherPhone, child.mother);
  }
}

// ---------------------------------------------------------------- report

const flagged = children.filter((c) => c.problems.length);
const codes = new Set();
for (const c of children) {
  if (codes.has(c.code)) throw new Error(`Duplicate student code ${c.code}`);
  codes.add(c.code);
}

console.log(`Academic year ${data.academicYear}`);
console.log(`${children.length} children, ${new Set([...fathers.values()]).size} fathers, ${mothers.size} mothers, ${lines.length} lines`);
console.log(`${flagged.length} children need review:`);
for (const c of flagged) console.log(`  ${c.code}  ${c.fullName}: ${c.problems.join("؛ ")}`);

// ---------------------------------------------------------------- import

async function run() {
  const existing = await prisma.student.count();

  if (!REPLACE) {
    console.log(`\nDry run: nothing written (${existing} students currently in the database). Add --replace to import.`);
    return;
  }

  const withPhotos = await prisma.student.count({ where: { photo: { not: null } } });
  if (withPhotos > 0) {
    throw new Error(`${withPhotos} existing students have photos; remove them first so no files are orphaned.`);
  }

  const now = new Date();

  await prisma.$transaction(
    async (tx) => {
      await tx.payment.deleteMany();
      await tx.enrollment.deleteMany();
      await tx.attendance.deleteMany();
      await tx.studentParent.deleteMany();
      await tx.parent.deleteMany();
      await tx.student.deleteMany();
      await tx.transportLine.deleteMany();
      await tx.class.deleteMany();
      await tx.academicYear.deleteMany();

      const year = await tx.academicYear.create({
        data: { name: data.academicYear, isActive: true }
      });

      const classIds = {};
      for (const section of data.sections) {
        const created = await tx.class.create({
          data: {
            name: section.section,
            grade: "روضة",
            shift: section.shift,
            teacherName: section.teacher,
            academicYearId: year.id
          }
        });
        classIds[`${section.shift}-${section.section}`] = created.id;
      }

      for (const line of lines) {
        line.id = (
          await tx.transportLine.create({
            data: { name: line.name, driverPhone: line.driverPhone, shift: line.shift }
          })
        ).id;
      }

      const parentIds = new Map();
      async function parentId(parent) {
        if (!parentIds.has(parent)) {
          const created = await tx.parent.create({ data: { ...parent, updatedAt: now } });
          parentIds.set(parent, created.id);
        }
        return parentIds.get(parent);
      }

      for (const child of children) {
        const student = await tx.student.create({
          data: {
            studentCode: child.code,
            firstName: child.name.first,
            fatherName: child.name.father,
            grandfatherName: child.name.grandfather,
            lastName: child.name.last,
            birthYear: child.birthYear,
            address: child.address,
            notes: child.notes.join(" — ") || null,
            reviewNote: child.problems.join("؛ ") || null,
            transportLineId: child.line ? child.line.id : null,
            transportOrder: child.line ? child.lineOrder : null,
            status: "ACTIVE",
            updatedAt: now
          }
        });

        if (child.father) {
          await tx.studentParent.create({
            data: { studentId: student.id, parentId: await parentId(child.father), relation: "FATHER" }
          });
        }
        if (child.mother) {
          await tx.studentParent.create({
            data: { studentId: student.id, parentId: await parentId(child.mother), relation: "MOTHER" }
          });
        }

        const enrollment = await tx.enrollment.create({
          data: {
            studentId: student.id,
            classId: classIds[`${child.shift}-${child.section}`],
            academicYearId: year.id,
            enrollmentDate: child.start,
            tuitionFee: child.fee ?? 0,
            attendanceType: child.attendanceType,
            paymentPlan: child.paymentPlan,
            status: "ACTIVE"
          }
        });

        const payments = [];
        if (child.paid > 0) {
          payments.push({ amount: child.paid, paymentType: "TUITION", description: child.period });
        }
        if (child.curriculum > 0) {
          payments.push({ amount: child.curriculum, paymentType: "CURRICULUM", description: null });
        }
        for (const payment of payments) {
          await tx.payment.create({
            data: { ...payment, enrollmentId: enrollment.id, paymentDate: child.start }
          });
        }
      }
    },
    { timeout: 120000 }
  );

  const [students, parents, enrollments, payments, classes, transportLines] = await Promise.all([
    prisma.student.count(),
    prisma.parent.count(),
    prisma.enrollment.count(),
    prisma.payment.count(),
    prisma.class.count(),
    prisma.transportLine.count()
  ]);
  console.log(`\nImported: ${students} students, ${parents} parents, ${enrollments} enrollments, ${payments} payments, ${classes} classes, ${transportLines} lines.`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
