import { NextRequest, NextResponse } from "next/server";
import { adminDb, getRequestUid } from "@/lib/firebaseAdmin";
import { CONNECTIONS } from "@/lib/adhanServer";

export async function POST(req: NextRequest) {
  const uid = await getRequestUid(req);
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await adminDb().collection(CONNECTIONS).doc(uid).delete();
  return NextResponse.json({ ok: true });
}
