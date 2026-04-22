import { describe, it, expect } from "vitest";
import { z } from "zod";
import { completeWithRetry } from "../llm/retry";
import {
  type CompleteOptions,
  type CompleteResult,
  type LlmProvider,
  type ModelInfo,
  ProviderParseError,
  type ValidateKeyResult,
} from "../llm/provider";

class ScriptedProvider implements LlmProvider {
  id = "anthropic" as const;
  displayName = "scripted";
  private call = 0;
  constructor(private scripts: Array<() => CompleteResult<unknown> | never>) {}
  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve([]);
  }
  validateKey(): Promise<ValidateKeyResult> {
    return Promise.resolve({ ok: true });
  }
  async complete<T>(_: CompleteOptions): Promise<CompleteResult<T>> {
    const fn = this.scripts[this.call++];
    if (!fn) throw new Error("No scripted response left");
    return fn() as CompleteResult<T>;
  }
  estimateCost() {
    return 0;
  }
}

const schema = z.object({ score: z.number().int(), rationale: z.string() });
const baseOpts: CompleteOptions = {
  apiKey: "x",
  model: "claude-opus-4-7",
  messages: [{ role: "user", content: "score this" }],
  responseSchema: schema,
  temperature: 0,
  maxTokens: 256,
};

describe("completeWithRetry", () => {
  it("returns the first successful completion", async () => {
    const p = new ScriptedProvider([
      () => ({
        content: { score: 3, rationale: "fits" },
        raw: '{"score":3,"rationale":"fits"}',
        tokensIn: 10,
        tokensOut: 5,
        latencyMs: 1,
      }),
    ]);
    const { result, meta } = await completeWithRetry(p, baseOpts);
    expect(result.content).toEqual({ score: 3, rationale: "fits" });
    expect(meta).toEqual({ attempts: 1, parseFailures: 0 });
  });

  it("retries on parse failure with a feedback message", async () => {
    const p = new ScriptedProvider([
      () => {
        throw new ProviderParseError("Invalid JSON: bad syntax", "not json");
      },
      () => ({
        content: { score: 2, rationale: "second try" },
        raw: '{"score":2,"rationale":"second try"}',
        tokensIn: 20,
        tokensOut: 5,
        latencyMs: 1,
      }),
    ]);
    const { result, meta } = await completeWithRetry(p, baseOpts);
    expect(result.content).toEqual({ score: 2, rationale: "second try" });
    expect(meta).toEqual({ attempts: 2, parseFailures: 1 });
  });

  it("gives up after the configured number of parse retries", async () => {
    const p = new ScriptedProvider([
      () => {
        throw new ProviderParseError("fail 1", "x");
      },
      () => {
        throw new ProviderParseError("fail 2", "x");
      },
      () => {
        throw new ProviderParseError("fail 3", "x");
      },
    ]);
    await expect(completeWithRetry(p, baseOpts, 2)).rejects.toBeInstanceOf(ProviderParseError);
  });
});
