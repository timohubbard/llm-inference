import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { scoreDictionary } from "@/lib/sidecar";

const body = z.object({
  method: z.enum(["lmd", "mfd2", "emolex", "huliu", "liwc", "custom_dict"]),
  corpusId: z.string().uuid(),
  primaryCategory: z.string().optional(),
  dictionary: z.record(z.array(z.string())).optional(),
  documents: z.array(z.object({ id: z.string(), text: z.string() })).min(1),
});

function computePrimary(
  counts: Record<string, number>,
  tokenCount: number,
  meta: { primaryMeasure?: { type: string; positive?: string; negative?: string; category?: string } | null },
  chosenCategory: string | undefined,
): number {
  const denom = Math.max(1, tokenCount);
  if (chosenCategory && chosenCategory in counts) {
    return (counts[chosenCategory] ?? 0) / denom;
  }
  const m = meta.primaryMeasure;
  if (m?.type === "diff_ratio" && m.positive && m.negative) {
    const pos = counts[m.positive] ?? 0;
    const neg = counts[m.negative] ?? 0;
    return (pos - neg) / denom;
  }
  if (m?.type === "single_category" && m.category) {
    return (counts[m.category] ?? 0) / denom;
  }
  if ("positive" in counts && "negative" in counts) {
    return ((counts.positive ?? 0) - (counts.negative ?? 0)) / denom;
  }
  // Fall back to the first category (stable order) — still gives a usable signal.
  const keys = Object.keys(counts).sort();
  if (keys.length === 0) return 0;
  return (counts[keys[0]!] ?? 0) / denom;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const result = await scoreDictionary(
      {
        method: parsed.data.method,
        dictionary: parsed.data.dictionary,
        documents: parsed.data.documents,
      },
      req,
    );
    const chosen = parsed.data.primaryCategory;
    const scores = result.scores.map((s) => ({
      id: s.id,
      tokenCount: s.tokenCount,
      categoryCounts: s.categoryCounts,
      score: computePrimary(s.categoryCounts, s.tokenCount, result.meta, chosen),
    }));
    return NextResponse.json({
      scores,
      meta: result.meta,
      summary: result.summary,
      sidecar: {
        version: result.sidecarVersion,
        imageDigest: result.sidecarImageDigest,
        requirementsHash: result.requirementsHash,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sidecar call failed" },
      { status: 502 },
    );
  }
}
