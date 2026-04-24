import { NextResponse } from "next/server";
import { getAuthUrl, getValidAccessToken } from "@/lib/google-calendar";

// GET /api/agenda/google — returns auth URL or connected status
export async function GET() {
  const token = await getValidAccessToken();
  if (token) return NextResponse.json({ connected: true });
  return NextResponse.json({ connected: false, authUrl: getAuthUrl() });
}
