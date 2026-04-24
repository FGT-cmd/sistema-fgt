import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";
import { getDefaultUser } from "@/lib/user";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/agenda?google=error", req.url));
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.access_token) {
      return NextResponse.redirect(new URL("/agenda?google=error", req.url));
    }

    const user = await getDefaultUser();
    const expiry = new Date(Date.now() + tokens.expires_in * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        googleAccessToken:  tokens.access_token,
        googleRefreshToken: tokens.refresh_token ?? undefined,
        googleTokenExpiry:  expiry,
      },
    });

    return NextResponse.redirect(new URL("/agenda?google=success", req.url));
  } catch (err) {
    console.error("[google/callback]", err);
    return NextResponse.redirect(new URL("/agenda?google=error", req.url));
  }
}
