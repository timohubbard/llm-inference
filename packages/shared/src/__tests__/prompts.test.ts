import { describe, it, expect } from "vitest";
import {
  buildConstructScoreSystemPrompt,
  buildConstructScoreUserPrompt,
  makeBoundedScoreSchema,
} from "../prompts/construct-scoring";
import type { ConstructDefinition } from "../schemas/construct";

const construct: ConstructDefinition = {
  name: "Promotion Focus",
  definition:
    "Regulatory focus oriented toward gains, aspirations, and advancement opportunities.",
  scaleMin: 1,
  scaleMax: 7,
  anchors: { 1: "strongly prevention-focused", 4: "balanced", 7: "strongly promotion-focused" },
  citations: ["Higgins (1997)"],
};

describe("construct-scoring prompts", () => {
  it("system prompt emits only JSON instruction", () => {
    const s = buildConstructScoreSystemPrompt();
    expect(s).toMatch(/JSON/);
  });

  it("user prompt includes name, definition, anchors, and scale bounds", () => {
    const u = buildConstructScoreUserPrompt({
      construct,
      document: { id: "doc1", type: "shareholder letter", text: "We are pursuing growth." },
    });
    expect(u).toContain("Promotion Focus");
    expect(u).toContain("1 = strongly prevention-focused");
    expect(u).toContain("7 = strongly promotion-focused");
    expect(u).toContain("shareholder letter");
    expect(u).toContain("integer in [1, 7]");
  });

  it("user prompt surfaces directional target when provided", () => {
    const u = buildConstructScoreUserPrompt({
      construct,
      document: { id: "doc1", text: "x" },
      directionalTarget: "new product launches",
    });
    expect(u).toContain("new product launches");
  });

  it("bounded schema rejects out-of-range scores", () => {
    const s = makeBoundedScoreSchema(1, 7);
    expect(s.safeParse({ score: 8, rationale: "too high for the scale" }).success).toBe(false);
    expect(s.safeParse({ score: 4, rationale: "reasonable length rationale" }).success).toBe(true);
  });
});
