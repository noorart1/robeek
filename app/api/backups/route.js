import { Readable } from "node:stream";
import { requireAdmin } from "../../../lib/auth";
import { errorResponse } from "../../../lib/users";
import { backupNow, listBackups, saveUpload } from "../../../lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// النسخ الاحتياطي: list (GET), make one now (POST), upload one (PUT, the
// raw file as the body). Admins only. Restore and download: ./[name].

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

function list(extra = {}) {
  return Response.json(
    { backups: listBackups(), ...extra },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET() {
  try {
    const { response } = await requireAdmin();
    if (response) return response;

    return list();
  } catch (error) {
    console.error("Backups GET error:", error);
    return errorResponse("حدث خطأ أثناء تحميل النسخ الاحتياطية.", 500);
  }
}

export async function POST() {
  try {
    const { response } = await requireAdmin();
    if (response) return response;

    const made = await backupNow("manual");
    return list({ made });
  } catch (error) {
    if (error.code === "BUSY") {
      return errorResponse("هناك نسخ احتياطي أو استعادة قيد التنفيذ. حاول بعد قليل.", 409);
    }

    console.error("Backups POST error:", error);
    return errorResponse("فشل إنشاء النسخة الاحتياطية.", 500);
  }
}

export async function PUT(request) {
  try {
    const { response } = await requireAdmin();
    if (response) return response;

    if (!request.body) return errorResponse("لم يتم اختيار ملف.", 400);

    const name = await saveUpload(Readable.fromWeb(request.body), MAX_UPLOAD_BYTES);
    return list({ uploaded: name });
  } catch (error) {
    if (error.code === "BAD_FILE") {
      return errorResponse("هذا الملف ليس نسخة احتياطية صالحة من هذا النظام.", 400);
    }

    if (error.code === "TOO_LARGE") {
      return errorResponse("الملف كبير جداً (الحد الأقصى ١ غيغابايت).", 413);
    }

    console.error("Backups PUT error:", error);
    return errorResponse("فشل رفع الملف.", 500);
  }
}
