import { NextRequest, NextResponse } from "next/server";
import { getRequestUid } from "@/lib/firebaseAdmin";
import { getGroups } from "@/lib/sonos";
import { getConnection, getValidToken } from "@/lib/adhanServer";

// Reports whether the user has Sonos connected and, if so, which rooms can play the adhan.
export async function GET(req: NextRequest) {
  const uid = await getRequestUid(req);
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conn = await getConnection(uid);
  if (!conn) return NextResponse.json({ connected: false, groups: [] });

  const token = await getValidToken(uid, conn);
  if (!token) return NextResponse.json({ connected: false, groups: [], error: "token_expired" });

  try {
    const groups = await getGroups(token, conn.householdId);
    return NextResponse.json({ connected: true, groups });
  } catch {
    return NextResponse.json({ connected: true, groups: [], error: "sonos_unreachable" });
  }
}
