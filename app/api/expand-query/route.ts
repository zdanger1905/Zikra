import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `You are helping search the Quran. Given a search term, return 2-4 close synonyms or alternate names that would appear in the SAME specific Quran verses about this exact topic. Only include words that are direct synonyms or alternate spellings — do NOT include broad related concepts.

Examples:
- "pig" → ["swine","pork","boar"]
- "alcohol" → ["wine","intoxicants","khamr"]
- "jesus" → ["Isa","Messiah","Christ"]
- "prayer" → ["salat","worship","prostration"]

Return ONLY a JSON array of strings, no explanation.

Search term: "${query}"`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "[]";
  try {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    const terms: string[] = JSON.parse(start !== -1 && end !== -1 ? text.slice(start, end + 1) : "[]");
    return Response.json({ terms: [query, ...terms].slice(0, 6) });
  } catch {
    return Response.json({ terms: [query] });
  }
}
