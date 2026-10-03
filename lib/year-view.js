import { cookies } from "next/headers";
import prisma from "./prisma";
import { summerYearName } from "./labels";
import { activeAcademicYear } from "./student-data";

// The school year every page shows: chosen in the header (YearPicker), kept
// in the `year` cookie, the active one by default. An earlier year shows
// with its own summer course («صيف 2026» for 2025-2026) and stays
// editable. Server only (pages and API routes).
export const YEAR_COOKIE = "year";

export async function yearView() {
  const id = Number((await cookies()).get(YEAR_COOKIE)?.value);
  const active = await activeAcademicYear();
  const chosen = id && id !== active?.id
    ? await prisma.academicYear.findFirst({ where: { id, kind: "REGULAR" } })
    : null;
  const year = chosen ?? active;

  const summer = chosen
    ? await prisma.academicYear.findUnique({ where: { name: summerYearName(chosen.name.slice(5)) } })
    : await activeAcademicYear(prisma, "SUMMER");

  return { year, summer, isActive: !chosen };
}

// What formatStudent needs from it.
export const studentView = ({ year, summer, isActive }) =>
  isActive ? null : { yearId: year.id, summerId: summer?.id ?? null };
