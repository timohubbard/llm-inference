import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseJsonWithSchema } from "../llm/parse";

const schema = z.object({ score: z.number().int().min(1).max(7), rationale: z.string().min(3) });

describe("parseJsonWithSchema", () => {
  it("parses a clean JSON object", () => {
    const r = parseJsonWithSchema('{"score": 4, "rationale": "fits"}', schema);
    expect(r.ok).toBe(true);
  });

  it("parses JSON wrapped in a markdown fence", () => {
    const r = parseJsonWithSchema('```json\n{"score": 5, "rationale": "okay enough"}\n```', schema);
    expect(r.ok).toBe(true);
  });

  it("extracts JSON embedded in prose", () => {
    const r = parseJsonWithSchema('Here it is: {"score": 3, "rationale": "mid"} — done.', schema);
    expect(r.ok).toBe(true);
  });

  it("rejects when no JSON object is present", () => {
    const r = parseJsonWithSchema("No JSON here.", schema);
    expect(r.ok).toBe(false);
  });

  it("rejects when schema validation fails", () => {
    const r = parseJsonWithSchema('{"score": 42, "rationale": "out of range"}', schema);
    expect(r.ok).toBe(false);
  });
});
