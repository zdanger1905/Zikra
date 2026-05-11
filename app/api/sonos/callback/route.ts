import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getHouseholds } from "@/lib/sonos";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/adhan?error=denied", req.url));
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const redirectUri = `${base}/api/sonos/callback`;

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    if (!tokens.access_token) {
      return NextResponse.redirect(new URL("/adhan?error=token_failed", req.url));
    }

    const { access_token, refresh_token, expires_in } = tokens;
    const householdsData = await getHouseholds(access_token);
    const householdId = householdsData.households?.[0]?.id ?? "";

    const session = JSON.stringify({ access_token, refresh_token, expires_in, householdId });
    const response = NextResponse.redirect(new URL("/adhan?connected=1", req.url));
    response.cookies.set("sonos_session", session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 120,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/adhan?error=auth_failed", req.url));
  }
}
