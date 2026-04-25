import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { getAnthropicModel } from "@/lib/anthropic-model";

export const runtime = "nodejs";

const MAX_PROMPT_CHARS = 200_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: string };
    let prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      prompt = `${prompt.slice(0, MAX_PROMPT_CHARS)}\n[… truncated …]`;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Ask AI is unavailable in this preview — needs Claude runtime." },
        { status: 503 },
      );
    }

    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: getAnthropicModel(),
      max_tokens: 1024,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();

    if (!text) {
      return NextResponse.json({ error: "Empty model response" }, { status: 502 });
    }

    return NextResponse.json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `(Error reaching Claude: ${message})` }, { status: 502 });
  }
}
