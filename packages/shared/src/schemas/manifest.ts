import { z } from "zod";

export const reproducibilityManifestSchema = z.object({
  toolVersion: z.string(),
  generatedAt: z.string().datetime(),
  project: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
  construct: z.object({
    name: z.string(),
    version: z.number().int(),
  }),
  corpus: z.object({
    name: z.string(),
    docCount: z.number().int(),
    checksumSha256: z.string(),
  }),
  traditionalRun: z.object({
    method: z.string(),
    params: z.unknown(),
    summary: z.unknown(),
  }).nullable(),
  llmRun: z.object({
    provider: z.string(),
    model: z.string(),
    modelVersion: z.string().nullable(),
    temperature: z.number(),
    seed: z.number().int().nullable(),
    promptVersion: z.string(),
    tokensIn: z.number().int(),
    tokensOut: z.number().int(),
    summary: z.unknown(),
  }).nullable(),
  pythonSidecar: z.object({
    imageDigest: z.string().nullable().optional(),
    version: z.string().nullable(),
    requirementsHash: z.string().nullable().optional(),
  }).optional(),
});

export type ReproducibilityManifest = z.infer<typeof reproducibilityManifestSchema>;
