import { NextRequest, NextResponse } from "next/server";
import { playAudioClip, refreshAccessToken } from "@/lib/sonos";

export async function POST(req: NextRequest) {
  const { accessToken, refreshToken, tokenExpiry, groupId, streamUrl, volume } = await req.json();

  if (!accessToken || !groupId || !streamUrl) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  let token = accessToken;

  // Refresh token if within 5 minutes of expiry
  if (Date.now() >= tokenExpiry - 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(refreshToken);
    if (refreshed.access_token) token = refreshed.access_token;
  }

  const result = await playAudioClip(token, groupId, streamUrl, volume ?? 40);
  return NextResponse.json(result);
}
