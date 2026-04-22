import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getProvider, type ProviderId } from "@llmi/shared";

const body = z.object({
  provider: z.enum(["anthropic", "openai", "openai-compat", "google"]),
  model: z.string().min(1),
  docsSample: z.array(z.object({ id: z.string(), text: z.string() })).min(1),
  totalDocs: z.number().int().positive(),
});

const CHARS_PER_TOKEN = 4; // rough; enough for a pre-run estimate
const OUTPUT_TOKENS_PER_DOC = 200;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const avgChars = parsed.data.docsSample.reduce((a, d) => a + d.text.length, 0) / parsed.data.docsSample.length;
  const avgInputTokens = Math.ceil((avgChars + 600) / CHARS_PER_TOKEN);
  const inputTokens = avgInputTokens * parsed.data.totalDocs;
  const outputTokens = OUTPUT_TOKENS_PER_DOC * parsed.data.totalDocs;

  const provider = getProvider(parsed.data.provider as ProviderId);
  const estimatedUsd = provider.estimateCost(parsed.data.model, inputTokens, outputTokens);

  return NextResponse.json({
    estimatedUsd,
    inputTokens,
    outputTokens,
    docsAveragedOver: parsed.data.docsSample.length,
  });
}
