import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminDb, getRequestUid } from "@/lib/firebaseAdmin";
import { getSonosAuthUrl, sonosRedirectUri } from "@/lib/sonos";
import { OAUTH_STATES } from "@/lib/adhanServer";

// Starts the Sonos OAuth flow for the signed-in user.
export async function POST(req: NextRequest) {
  const uid = await getRequestUid(req);
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SONOS_CLIENT_ID) return NextResponse.json({ error: "not_configured" }, { status: 500 });

  const state = randomBytes(24).toString("hex");
  await adminDb().collection(OAUTH_STATES).doc(state).set({ uid, createdAt: Date.now() });

  return NextResponse.json({ url: getSonosAuthUrl(sonosRedirectUri(req.nextUrl.origin), state) });
}
