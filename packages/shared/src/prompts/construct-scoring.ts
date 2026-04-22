import { z } from "zod";
import type { ConstructDefinition } from "../schemas/construct";

export const CONSTRUCT_SCORING_PROMPT_VERSION = "1.0.0";

export const constructScoreResponseSchema = z.object({
  score: z.number().int(),
  rationale: z.string().min(10).max(800),
});

export type ConstructScoreResponse = z.infer<typeof constructScoreResponseSchema>;

export function buildConstructScoreSystemPrompt(): string {
  return [
    "You are an expert research assistant scoring organizational text for a defined construct.",
    "Score strictly against the definition and scale anchors provided; do not substitute your own definition.",
    "Return ONLY a single JSON object matching the requested schema — no prose, no code fences, no commentary.",
  ].join(" ");
}

export interface ConstructScoreUserOptions {
  construct: ConstructDefinition;
  document: { id: string; type?: string; text: string };
  directionalTarget?: string;
  limitationHints?: {
    negationSensitive?: boolean;
    synonymExpansion?: boolean;
  };
}

export function buildConstructScoreUserPrompt(opts: ConstructScoreUserOptions): string {
  const { construct, document, directionalTarget, limitationHints } = opts;
  const anchorLines = Object.entries(construct.anchors)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, v]) => `  ${k} = ${v}`)
    .join("\n");

  const hints: string[] = [];
  if (limitationHints?.negationSensitive) {
    hints.push("Pay careful attention to negations that may invert apparent meaning.");
  }
  if (limitationHints?.synonymExpansion) {
    hints.push("Consider semantically equivalent phrasings, not only surface forms of the construct term.");
  }
  if (directionalTarget) {
    hints.push(`Score the construct specifically as directed toward: ${directionalTarget}.`);
  }

  return [
    `Construct: ${construct.name}`,
    `Definition: ${construct.definition}`,
    `Scale: integer from ${construct.scaleMin} to ${construct.scaleMax}`,
    `Anchors:\n${anchorLines}`,
    hints.length ? `Guidance:\n- ${hints.join("\n- ")}` : null,
    `Document type: ${document.type ?? "text"}`,
    `Document:\n"""\n${document.text}\n"""`,
    `Return JSON exactly matching: {"score": <integer in [${construct.scaleMin}, ${construct.scaleMax}]>, "rationale": "<1-3 sentence justification citing specific passages>"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function makeBoundedScoreSchema(scaleMin: number, scaleMax: number) {
  return z.object({
    score: z.number().int().min(scaleMin).max(scaleMax),
    rationale: z.string().min(10).max(800),
  });
}
