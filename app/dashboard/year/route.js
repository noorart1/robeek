import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { YEAR_COOKIE } from "../../../lib/year-view";

export const dynamic = "force-dynamic";

// GET /dashboard/year?id=<academic year id>&to=/dashboard/students?class=3
// Chooses the year every page shows and goes on to `to`; without an id,
// back to the active year. The header's picker, its «العودة» button and
// the dashboard's links to other years all come through here, so the
// cookie is only ever set and cleared by the server. It lasts for the
// browser session: closing the browser goes back to the current year.
export async function GET(request) {
  // A prefetch (a Next.js <Link> scrolled into view) must not switch it.
  if (request.headers.get("next-router-prefetch") || request.headers.get("purpose") === "prefetch") {
    return new Response(null, { status: 204 });
  }

  const user = await getCurrentUser();
  const url = new URL(request.url);
  const to = url.searchParams.get("to") || "";
  // Only pages of this app: never an open redirect.
  const target = /^\/dashboard(\/|\?|$)/.test(to) ? to : "/dashboard";
  // A relative Location: behind Passenger request.url is the app's own
  // http://localhost:3000, not the public address.
  const response = new NextResponse(null, { status: 303, headers: { Location: target } });

  if (user?.role !== "ADMIN") return response;

  const id = Number(url.searchParams.get("id"));
  if (Number.isInteger(id) && id > 0) {
    response.cookies.set(YEAR_COOKIE, String(id), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV !== "development"
    });
  } else {
    response.cookies.set(YEAR_COOKIE, "", { path: "/", maxAge: 0 });
  }
  // The first version's cookie, kept for a year by the browser.
  response.cookies.set("year", "", { path: "/", maxAge: 0 });

  return response;
}
