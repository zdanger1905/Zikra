import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { exchangeCodeForTokens, getHouseholds, sonosRedirectUri } from "@/lib/sonos";
import { CONNECTIONS, OAUTH_STATES } from "@/lib/adhanServer";

const STATE_TTL_MS = 15 * 60 * 1000;

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const back = (query: string) => NextResponse.redirect(new URL(`/adhan?${query}`, req.url));

  if (error || !code || !state) return back("error=denied");

  try {
    const db = adminDb();
    const stateRef = db.collection(OAUTH_STATES).doc(state);
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) return back("error=invalid_state");
    await stateRef.delete();

    const { uid, createdAt } = stateSnap.data() as { uid: string; createdAt: number };
    if (Date.now() - createdAt > STATE_TTL_MS) return back("error=invalid_state");

    const tokens = await exchangeCodeForTokens(code, sonosRedirectUri(req.nextUrl.origin));
    if (!tokens.access_token || !tokens.refresh_token) return back("error=token_failed");

    let households: { id: string }[];
    try {
      households = await getHouseholds(tokens.access_token);
    } catch (e) {
      console.error("Sonos households request failed", e);
      return back("error=households_failed");
    }
    if (!households.length) return back("error=no_household");

    await db.collection(CONNECTIONS).doc(uid).set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: Date.now() + (tokens.expires_in ?? 86400) * 1000,
      householdId: households[0].id,
    });

    return back("connected=1");
  } catch (e) {
    console.error("Sonos callback failed", e);
    return back("error=auth_failed");
  }
}
