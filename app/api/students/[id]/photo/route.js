
import prisma from "../../../../../lib/prisma";
import { requireOffice } from "../../../../../lib/auth";
import {
  MAX_PHOTO_BYTES,
  deletePhoto,
  isJpeg,
  readPhoto,
  savePhoto
} from "../../../../../lib/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message, status) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

async function getStudentId(params) {
  const { id } = await params;
  const studentId = Number(id);

  return Number.isSafeInteger(studentId) && studentId > 0
    ? studentId
    : null;
}

// عرض صورة الطفل

export async function GET(request, { params }) {
  try {
    const { response } = await requireOffice();
    if (response) return response;

    const studentId = await getStudentId(params);

    if (!studentId) {
      return errorResponse("معرّف الطفل غير صالح.", 400);
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { photo: true }
    });

    const photo = student && (await readPhoto(student.photo));

    if (!photo) {
      return errorResponse("لا توجد صورة لهذا الطفل.", 404);
    }

    // The URL carries the file name (?v=...), which changes on every
    // upload, so the browser may keep this copy for as long as it likes.
    return new Response(photo, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Student photo GET error:", error);

    return errorResponse("حدث خطأ أثناء تحميل الصورة.", 500);
  }
}

// رفع صورة جديدة (JPEG)

export async function PUT(request, { params }) {
  try {
    const { response } = await requireOffice();
    if (response) return response;

    const studentId = await getStudentId(params);

    if (!studentId) {
      return errorResponse("معرّف الطفل غير صالح.", 400);
    }

    const declaredLength = Number(
      request.headers.get("content-length")
    );

    if (declaredLength > MAX_PHOTO_BYTES) {
      return errorResponse("حجم الصورة كبير جداً.", 413);
    }

    const buffer = Buffer.from(await request.arrayBuffer());

    if (buffer.length > MAX_PHOTO_BYTES) {
      return errorResponse("حجم الصورة كبير جداً.", 413);
    }

    if (!isJpeg(buffer)) {
      return errorResponse("صيغة الصورة غير مدعومة.", 400);
    }

    const existing = await prisma.student.findUnique({
      where: { id: studentId },
      select: { photo: true }
    });

    if (!existing) {
      return errorResponse("لم يتم العثور على الطفل المطلوب.", 404);
    }

    const name = await savePhoto(studentId, buffer);

    const student = await prisma.student.update({
      where: { id: studentId },
      // updatedAt is deliberately left alone: the photo is not one of the
      // conflict-checked fields, and bumping it would make any edit already
      // open on this row fail with a false conflict.
      data: { photo: name }
    });

    await deletePhoto(existing.photo);

    return Response.json(
      { success: true, student },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Student photo PUT error:", error);

    return errorResponse("حدث خطأ أثناء حفظ الصورة.", 500);
  }
}

// حذف الصورة

export async function DELETE(request, { params }) {
  try {
    const { response } = await requireOffice();
    if (response) return response;

    const studentId = await getStudentId(params);

    if (!studentId) {
      return errorResponse("معرّف الطفل غير صالح.", 400);
    }

    const existing = await prisma.student.findUnique({
      where: { id: studentId },
      select: { photo: true }
    });

    if (!existing) {
      return errorResponse("لم يتم العثور على الطفل المطلوب.", 404);
    }

    const student = await prisma.student.update({
      where: { id: studentId },
      data: { photo: null }
    });

    await deletePhoto(existing.photo);

    return Response.json(
      { success: true, student },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Student photo DELETE error:", error);

    return errorResponse("حدث خطأ أثناء حذف الصورة.", 500);
  }
}
