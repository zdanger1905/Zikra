import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = req.cookies.get("sonos_session")?.value;
  if (!session) return NextResponse.json(null);

  const response = NextResponse.json(JSON.parse(session));
  response.cookies.set("sonos_session", "", { maxAge: 0, path: "/" });
  return response;
}
