import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { YEAR_COOKIE } from "../../../lib/year-view";

export const dynamic = "force-dynamic";

// GET /dashboard/year?id=<academic year id>&to=/dashboard/students?class=3
// Chooses the year every page shows (as the header's YearPicker does) and
// goes on to `to`: links from one year's figures to its children. Without
// an id, back to the active year.
export async function GET(request) {
  const user = await getCurrentUser();
  const url = new URL(request.url);
  const to = url.searchParams.get("to") || "";
  // Only pages of this app: never an open redirect.
  const target = /^\/dashboard(\/|\?|$)/.test(to) ? to : "/dashboard";
  const response = NextResponse.redirect(new URL(target, url));

  if (user?.role !== "ADMIN") return response;

  const id = Number(url.searchParams.get("id"));
  if (Number.isInteger(id) && id > 0) {
    response.cookies.set(YEAR_COOKIE, String(id), { path: "/", maxAge: 31536000, sameSite: "lax" });
  } else {
    response.cookies.delete(YEAR_COOKIE);
  }

  return response;
}
