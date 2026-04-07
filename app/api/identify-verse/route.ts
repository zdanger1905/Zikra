import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { transcript } = await req.json();

  const msg = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `You are a Quran scholar. The following Arabic text was captured via speech recognition and may have minor errors or missing diacritics. Identify which Quran verse(s) this is from.

Arabic transcript: "${transcript}"

Reply with ONLY a JSON array of up to 3 matches, most likely first. Each object must have: surah (number), verse (number), confidence ("high"/"medium"/"low"). Example: [{"surah":1,"verse":1,"confidence":"high"}]

If you cannot identify it, return [].`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "[]";
  try {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    const matches = JSON.parse(start !== -1 && end !== -1 ? text.slice(start, end + 1) : "[]");
    return Response.json({ matches });
  } catch {
    return Response.json({ matches: [] });
  }
}
