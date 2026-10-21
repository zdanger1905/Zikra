import { NextRequest, NextResponse } from "next/server";
import { runAdhanTick } from "@/lib/adhanServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Hit once a minute by a cron service with `Authorization: Bearer <CRON_SECRET>`.
async function handler(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runAdhanTick(req.nextUrl.origin);
  return NextResponse.json(summary);
}

export { handler as GET, handler as POST };
