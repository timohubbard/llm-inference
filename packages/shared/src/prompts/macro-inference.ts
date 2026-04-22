import { z } from "zod";
import type { ConstructDefinition } from "../schemas/construct";

export const MACRO_INFERENCE_PROMPT_VERSION = "1.0.0";

export const macroSignalSchema = z.object({
  signal: z.string().min(3).max(200),
  signalType: z.enum(["lexical", "phrasal", "syntactic", "semantic", "structural"]),
  rationale: z.string().min(10).max(800),
  suggestedOperationalization: z.string().min(5).max(500),
});

export const macroInferenceResponseSchema = z.object({
  signals: z.array(macroSignalSchema).min(1).max(15),
  notes: z.string().max(1000).optional(),
});

export type MacroInferenceResponse = z.infer<typeof macroInferenceResponseSchema>;

export function buildMacroInferenceSystemPrompt(): string {
  return [
    "You are an expert inductive textual analyst helping a management researcher discover candidate signals",
    "for a construct beyond what a pre-specified dictionary or scoring rubric captures.",
    "Return ONLY a single JSON object matching the requested schema — no prose, no code fences.",
  ].join(" ");
}

export function buildMacroInferenceUserPrompt(opts: {
  construct: ConstructDefinition;
  outcomeVariable?: string;
  sampleDocuments: Array<{ id: string; text: string }>;
}): string {
  const { construct, outcomeVariable, sampleDocuments } = opts;
  const docs = sampleDocuments
    .map((d, i) => `[Doc ${i + 1} | id=${d.id}]\n${d.text}`)
    .join("\n\n---\n\n");

  return [
    `Construct: ${construct.name}`,
    `Definition: ${construct.definition}`,
    outcomeVariable ? `Outcome variable under study: ${outcomeVariable}` : null,
    "Task: Inductively identify candidate lexical, phrasal, syntactic, semantic, or structural signals",
    "in the documents below that may indicate variation in this construct — especially signals a",
    "standard dictionary or rubric might miss. For each, suggest a concrete operationalization",
    "(e.g., keyword pattern, regex, embedding similarity to a seed phrase, structural ratio).",
    "",
    "Sample documents:",
    docs,
    "",
    "Return JSON exactly matching the schema: { signals: [{ signal, signalType, rationale, suggestedOperationalization }], notes? }",
  ]
    .filter(Boolean)
    .join("\n\n");
}
