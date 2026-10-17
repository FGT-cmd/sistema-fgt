import { NextRequest,NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";
import { listCalendarEvents } from "@/lib/google-calendar";
import { eventFromGoogle,taskFromRow,parseRange } from "@/lib/agenda/views";
import { getSyncStatus } from "@/lib/ticktick/syncRunner";
export async function GET(req: NextRequest) {
  const params=new URL(req.url).searchParams,
    range=parseRange(params.get("from"),params.get("to"));
  if(!range) return NextResponse.json({
    error: "Intervalo inválido: use datas reais YYYY-MM-DD, em ordem, com até 366 dias."
  },{
    status: 400
  });
  try {
    const user=await getDefaultUser();
    const [rows,google,sync]=await Promise.all([prisma.todoTask.findMany({
      where: {
        userId: user.id,
        status: {
          in: ["pending","waiting"]
        }
      }
    }),listCalendarEvents(range.timeMin,range.timeMax,{
      strictRefreshErrors: true,
      exposeCalendarApiErrors: true
    }).then(events => ({
      events: events??[],
      error: null as string|null
    })).catch(() => ({
      events: [],
      error: "Não foi possível carregar os eventos do Google. Tente novamente ou reconecte a conta."
    })),getSyncStatus()]);
    return NextResponse.json({
      items: [...rows.map(taskFromRow),...google.events.map(eventFromGoogle)],
      sync,
      googleError: google.error
    });
  } catch {
    return NextResponse.json({
      error: "Não foi possível carregar a agenda. Tente novamente."
    },{
      status: 500
    });
  }
}
