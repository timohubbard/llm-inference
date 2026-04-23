import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getProvider, type ProviderId } from "@llmi/shared";

const body = z.object({
  provider: z.enum(["anthropic", "openai", "openai-compat", "google"]),
  // Back-compat: accept either a single `model` or a list of `models`
  model: z.string().min(1).optional(),
  models: z.array(z.string().min(1)).optional(),
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
  const models = parsed.data.models && parsed.data.models.length > 0
    ? parsed.data.models
    : parsed.data.model
      ? [parsed.data.model]
      : null;
  if (!models) {
    return NextResponse.json({ error: "Must supply `model` or `models`" }, { status: 400 });
  }

  const avgChars = parsed.data.docsSample.reduce((a, d) => a + d.text.length, 0) / parsed.data.docsSample.length;
  const avgInputTokens = Math.ceil((avgChars + 600) / CHARS_PER_TOKEN);
  const inputTokens = avgInputTokens * parsed.data.totalDocs;
  const outputTokens = OUTPUT_TOKENS_PER_DOC * parsed.data.totalDocs;

  const provider = getProvider(parsed.data.provider as ProviderId);
  const estimates = models.map((m) => ({
    model: m,
    estimatedUsd: provider.estimateCost(m, inputTokens, outputTokens) ?? 0,
  }));
  const totalUsd = estimates.reduce((a, e) => a + e.estimatedUsd, 0);

  return NextResponse.json({
    estimates,
    totalUsd,
    // Legacy fields — kept for any older client that only reads `estimatedUsd`
    estimatedUsd: estimates[0]?.estimatedUsd ?? 0,
    inputTokens,
    outputTokens,
    docsAveragedOver: parsed.data.docsSample.length,
  });
}
