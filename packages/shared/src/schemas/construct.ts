import { z } from "zod";

export const constructDefinitionSchema = z.object({
  name: z.string().min(1).max(120),
  definition: z.string().min(10).max(4000),
  scaleMin: z.number().int(),
  scaleMax: z.number().int(),
  anchors: z.record(z.string(), z.string().min(1).max(500)),
  citations: z.array(z.string().max(500)).default([]),
}).refine((c) => c.scaleMax > c.scaleMin, {
  message: "scaleMax must be greater than scaleMin",
  path: ["scaleMax"],
}).refine((c) => Object.keys(c.anchors).every((k) => {
  const n = Number(k);
  return Number.isInteger(n) && n >= c.scaleMin && n <= c.scaleMax;
}), {
  message: "All anchor keys must be integers within [scaleMin, scaleMax]",
  path: ["anchors"],
});

export type ConstructDefinition = z.infer<typeof constructDefinitionSchema>;

export const hypothesisSchema = z.object({
  text: z.string().min(10).max(4000),
  preRegisteredAt: z.string().datetime().nullable().optional(),
  osfUrl: z.string().url().nullable().optional(),
});

export type Hypothesis = z.infer<typeof hypothesisSchema>;
