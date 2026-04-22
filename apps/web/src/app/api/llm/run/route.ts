import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  buildConstructScoreSystemPrompt,
  buildConstructScoreUserPrompt,
  completeWithRetry,
  CONSTRUCT_SCORING_PROMPT_VERSION,
  getProvider,
  makeBoundedScoreSchema,
  ProviderParseError,
  type ProviderId,
} from "@llmi/shared";
import { db } from "@/db/client";
import { constructs, corpora, llmPrompts, llmRuns, projects } from "@/db/schema";
import { resolveKey } from "@/lib/providers";
import { reserveReviewerSpend, ReviewerBudgetExhausted } from "@/lib/reviewer";

const body = z.object({
  projectId: z.string().uuid(),
  constructId: z.string().uuid(),
  corpusId: z.string().uuid(),
  provider: z.enum(["anthropic", "openai", "openai-compat", "google"]),
  apiKey: z.string().optional(),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0),
  seed: z.number().int().optional(),
  documents: z.array(z.object({ id: z.string(), text: z.string() })).min(1).max(2000),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return new Response(parsed.error.message, { status: 400 });
  }

  const owned = (
    await db()
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, parsed.data.projectId), eq(projects.ownerId, userId)))
  )[0];
  if (!owned) return new Response("not found", { status: 404 });

  const [construct] = await db().select().from(constructs).where(eq(constructs.id, parsed.data.constructId));
  const [corpus] = await db().select().from(corpora).where(eq(corpora.id, parsed.data.corpusId));
  if (!construct || !corpus) return new Response("missing construct or corpus", { status: 400 });

  const key = await resolveKey(parsed.data.provider as ProviderId, parsed.data.apiKey);
  const provider = getProvider(parsed.data.provider as ProviderId);
  const schema = makeBoundedScoreSchema(construct.scaleMin, construct.scaleMax);

  const [promptRow] = await db()
    .insert(llmPrompts)
    .values({
      constructId: construct.id,
      template: "construct-scoring",
      variablesSchema: { construct: "object", document: "object" } as unknown as object,
      promptVersion: CONSTRUCT_SCORING_PROMPT_VERSION,
    })
    .returning();

  const [runRow] = await db()
    .insert(llmRuns)
    .values({
      corpusId: corpus.id,
      promptId: promptRow!.id,
      provider: parsed.data.provider,
      model: parsed.data.model,
      modelVersion: null,
      temperature: parsed.data.temperature,
      seed: parsed.data.seed ?? null,
      keyMode: key.mode,
      status: "running",
    })
    .returning();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const system = buildConstructScoreSystemPrompt();
      let totalIn = 0;
      let totalOut = 0;
      let modelVersion: string | null = null;

      try {
        for (const doc of parsed.data.documents) {
          const userPrompt = buildConstructScoreUserPrompt({
            construct: {
              name: construct.name,
              definition: construct.definition,
              scaleMin: construct.scaleMin,
              scaleMax: construct.scaleMax,
              anchors: construct.anchors,
              citations: construct.citations,
            },
            document: { id: doc.id, text: doc.text },
          });

          if (key.mode === "reviewer" && key.sessionId) {
            const est = provider.estimateCost(parsed.data.model, Math.ceil(userPrompt.length / 4), 200) ?? 0.01;
            try {
              await reserveReviewerSpend(key.sessionId, est);
            } catch (err) {
              if (err instanceof ReviewerBudgetExhausted) {
                controller.enqueue(encoder.encode(JSON.stringify({
                  id: doc.id, score: null, rationale: "", error: err.message,
                }) + "\n"));
                break;
              }
              throw err;
            }
          }

          try {
            const { result } = await completeWithRetry<{ score: number; rationale: string }>(provider, {
              apiKey: key.apiKey,
              model: parsed.data.model,
              system,
              messages: [{ role: "user", content: userPrompt }],
              responseSchema: schema,
              temperature: parsed.data.temperature,
              seed: parsed.data.seed,
              maxTokens: 400,
            });
            totalIn += result.tokensIn;
            totalOut += result.tokensOut;
            if (!modelVersion && result.modelVersion) modelVersion = result.modelVersion;
            controller.enqueue(encoder.encode(JSON.stringify({
              id: doc.id,
              score: result.content.score,
              rationale: result.content.rationale,
            }) + "\n"));
          } catch (err) {
            const msg = err instanceof ProviderParseError
              ? `parse_failed: ${err.message}`
              : err instanceof Error ? err.message : String(err);
            controller.enqueue(encoder.encode(JSON.stringify({
              id: doc.id, score: null, rationale: "", error: msg,
            }) + "\n"));
          }
        }

        await db()
          .update(llmRuns)
          .set({
            status: "completed",
            finishedAt: new Date(),
            costTokensIn: totalIn,
            costTokensOut: totalOut,
            modelVersion,
          })
          .where(eq(llmRuns.id, runRow!.id));
      } catch (err) {
        await db()
          .update(llmRuns)
          .set({
            status: "failed",
            finishedAt: new Date(),
            summary: { error: err instanceof Error ? err.message : String(err) },
          })
          .where(eq(llmRuns.id, runRow!.id));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "X-Run-Id": runRow!.id,
    },
  });
}
