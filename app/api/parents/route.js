import prisma from "../../../lib/prisma";
import { requireOffice } from "../../../lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { user, response } = await requireOffice();
    if (response) return response;
    const parents = await prisma.parent.findMany({select:{id:true,firstName:true,lastName:true,phone:true},orderBy:{id:"desc"},take:500});
    return Response.json({parents},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    console.error("Parents list error:",error);
    return Response.json({error:"تعذر تحميل أولياء الأمور."},{status:500});
  }
}
