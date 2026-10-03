
import prisma from "../../../lib/prisma";
import { requireAdmin } from "../../../lib/auth";
import { validateLine } from "../../../lib/transport-lines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message, status, extra = {}) {
  return Response.json(
    { error: message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// إضافة خط نقل جديد

export async function POST(request) {
  try {
    const { user, response } = await requireAdmin();
    if (response) return response;

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse("البيانات المرسلة غير صالحة.", 400);
    }

    const checked = validateLine(body);

    if (checked.error) {
      return errorResponse(checked.error, 400, { field: checked.field });
    }

    const line = await prisma.transportLine.create({ data: checked.data });

    return Response.json(
      { line },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Transport line POST error:", error);

    return errorResponse("حدث خطأ أثناء إضافة الخط.", 500);
  }
}
