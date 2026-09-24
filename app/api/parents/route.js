import prisma from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return Response.json({error:"ليس لديك صلاحية الوصول."},{status:401});
    const parents = await prisma.parent.findMany({select:{id:true,firstName:true,lastName:true,phone:true},orderBy:{id:"desc"},take:500});
    return Response.json({parents},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    console.error("Parents list error:",error);
    return Response.json({error:"تعذر تحميل أولياء الأمور."},{status:500});
  }
}
