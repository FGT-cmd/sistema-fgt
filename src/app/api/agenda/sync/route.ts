import { NextRequest, NextResponse } from "next/server";
import { getSyncStatus, runTickTickSync } from "@/lib/ticktick/syncRunner";
export const maxDuration = 120;
export async function GET() { return NextResponse.json(await getSyncStatus()); }
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let body: unknown = {};
  try { if(raw.trim()) body=JSON.parse(raw); } catch { return NextResponse.json({error:"JSON inválido"},{status:400}); }
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>k!=="dryRun")||("dryRun" in body&&typeof body.dryRun!=="boolean")) return NextResponse.json({error:"Use apenas dryRun booleano"},{status:400});
  const result=await runTickTickSync({dryRun:(body as {dryRun?:boolean}).dryRun});
  return NextResponse.json(result,{status:result.ok?200:502});
}
