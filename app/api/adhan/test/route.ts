import { NextRequest, NextResponse } from "next/server";
import { getRequestUid } from "@/lib/firebaseAdmin";
import { playAdhanForUser } from "@/lib/adhanServer";

// Plays the user's chosen adhan on their selected speakers right now, at their test volume.
// With { preview: true } only the opening "Allahu Akbar, Allahu Akbar" plays.
export async function POST(req: NextRequest) {
  const uid = await getRequestUid(req);
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { preview } = await req.json().catch(() => ({ preview: false }));
  const result = await playAdhanForUser(uid, {
    clip: preview ? "preview" : "full",
    origin: req.nextUrl.origin,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
