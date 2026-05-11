import { NextRequest, NextResponse } from "next/server";
import { getGroups, refreshAccessToken } from "@/lib/sonos";

export async function POST(req: NextRequest) {
  const { accessToken, refreshToken, tokenExpiry, householdId } = await req.json();

  if (!accessToken || !householdId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  let token = accessToken;
  let newAccessToken: string | null = null;

  if (Date.now() >= tokenExpiry - 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (refreshed.access_token) {
      token = refreshed.access_token;
      newAccessToken = token;
    }
  }

  const data = await getGroups(token, householdId);
  return NextResponse.json({ groups: data.groups ?? [], newAccessToken });
}
