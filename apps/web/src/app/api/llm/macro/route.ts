import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  buildMacroInferenceSystemPrompt,
  buildMacroInferenceUserPrompt,
  completeWithRetry,
  getProvider,
  macroInferenceResponseSchema,
  type ProviderId,
} from "@llmi/shared";
import { db } from "@/db/client";
import { constructs, projects } from "@/db/schema";
import { resolveKey } from "@/lib/providers";
import { reserveReviewerSpend, ReviewerBudgetExhausted } from "@/lib/reviewer";

const body = z.object({
  projectId: z.string().uuid(),
  constructId: z.string().uuid(),
  provider: z.enum(["anthropic", "openai", "openai-compat", "google"]),
  apiKey: z.string().optional(),
  model: z.string().min(1),
  outcomeVariable: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.2),
  sampleDocuments: z
    .array(z.object({ id: z.string(), text: z.string() }))
    .min(1)
    .max(30),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const owned = (
    await db()
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, parsed.data.projectId), eq(projects.ownerId, userId)))
  )[0];
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [construct] = await db().select().from(constructs).where(eq(constructs.id, parsed.data.constructId));
  if (!construct) return NextResponse.json({ error: "construct missing" }, { status: 400 });

  try {
    const key = await resolveKey(parsed.data.provider as ProviderId, parsed.data.apiKey);
    const provider = getProvider(parsed.data.provider as ProviderId);

    const userPrompt = buildMacroInferenceUserPrompt({
      construct: {
        name: construct.name,
        definition: construct.definition,
        scaleMin: construct.scaleMin,
        scaleMax: construct.scaleMax,
        anchors: construct.anchors,
        citations: construct.citations,
      },
      outcomeVariable: parsed.data.outcomeVariable,
      sampleDocuments: parsed.data.sampleDocuments,
    });

    if (key.mode === "reviewer" && key.sessionId) {
      const est = provider.estimateCost(parsed.data.model, Math.ceil(userPrompt.length / 4), 1200) ?? 0.05;
      await reserveReviewerSpend(key.sessionId, est);
    }

    const { result } = await completeWithRetry<z.infer<typeof macroInferenceResponseSchema>>(provider, {
      apiKey: key.apiKey,
      model: parsed.data.model,
      system: buildMacroInferenceSystemPrompt(),
      messages: [{ role: "user", content: userPrompt }],
      responseSchema: macroInferenceResponseSchema,
      temperature: parsed.data.temperature,
      maxTokens: 2000,
    });

    return NextResponse.json({
      signals: result.content.signals,
      notes: result.content.notes ?? null,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      modelVersion: result.modelVersion ?? null,
    });
  } catch (err) {
    if (err instanceof ReviewerBudgetExhausted) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
