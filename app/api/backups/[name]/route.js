import fs from "node:fs";
import { Readable } from "node:stream";
import { requireAdmin } from "../../../../lib/auth";
import { errorResponse } from "../../../../lib/users";
import { backupPath, isBackupName, listBackups, restore } from "../../../../lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { response } = await requireAdmin();
    if (response) return response;

    const { name } = await params;

    if (!isBackupName(name) || !fs.existsSync(backupPath(name))) {
      return errorResponse("النسخة الاحتياطية غير موجودة.", 404);
    }

    const file = backupPath(name);

    return new Response(Readable.toWeb(fs.createReadStream(file)), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(fs.statSync(file).size),
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Backup download error:", error);
    return errorResponse("حدث خطأ أثناء تنزيل النسخة الاحتياطية.", 500);
  }
}

export async function POST(request, { params }) {
  try {
    const { response } = await requireAdmin();
    if (response) return response;

    const { name } = await params;

    if (!isBackupName(name)) return errorResponse("النسخة الاحتياطية غير موجودة.", 404);

    const safety = await restore(name);

    return Response.json(
      { restored: name, safety, backups: listBackups() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error.code === "NOT_FOUND") return errorResponse("النسخة الاحتياطية غير موجودة.", 404);

    if (error.code === "BAD_FILE") {
      return errorResponse("هذا الملف ليس نسخة احتياطية صالحة من هذا النظام.", 400);
    }

    if (error.code === "BUSY") {
      return errorResponse("هناك نسخ احتياطي أو استعادة قيد التنفيذ. حاول بعد قليل.", 409);
    }

    console.error("Backup restore error:", error);
    return errorResponse("فشلت الاستعادة. إن ظهرت في القائمة نسخة «قبل الاستعادة» جديدة، فهي البيانات كما كانت قبل المحاولة.", 500);
  }
}
