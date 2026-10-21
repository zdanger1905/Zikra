import { NextRequest, NextResponse } from "next/server";
import { getRequestUid } from "@/lib/firebaseAdmin";
import { playAdhanForUser } from "@/lib/adhanServer";

// Plays the user's chosen adhan on their selected speaker right now.
export async function POST(req: NextRequest) {
  const uid = await getRequestUid(req);
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await playAdhanForUser(uid);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
