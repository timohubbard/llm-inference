import Anthropic from "@anthropic-ai/sdk";
import {
  type CompleteOptions,
  type CompleteResult,
  type LlmProvider,
  type ModelInfo,
  ProviderAuthError,
  ProviderParseError,
  ProviderRateLimitError,
  type ValidateKeyResult,
} from "../provider";
import { parseJsonWithSchema } from "../parse";

const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    contextWindow: 200_000,
    supportsJsonMode: true,
    supportsSeed: false,
    inputCostPerMTok: 15,
    outputCostPerMTok: 75,
  },
  {
    id: "claude-sonnet-4-5",
    displayName: "Claude Sonnet 4.5",
    contextWindow: 200_000,
    supportsJsonMode: true,
    supportsSeed: false,
    inputCostPerMTok: 3,
    outputCostPerMTok: 15,
  },
  {
    id: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    contextWindow: 200_000,
    supportsJsonMode: true,
    supportsSeed: false,
    inputCostPerMTok: 1,
    outputCostPerMTok: 5,
  },
];

export class AnthropicProvider implements LlmProvider {
  id = "anthropic" as const;
  displayName = "Anthropic";

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    const client = new Anthropic({ apiKey });
    try {
      const res = await client.models.list({ limit: 100 });
      const live = res.data.map<ModelInfo>((m) => ({
        id: m.id,
        displayName: m.display_name ?? m.id,
        supportsJsonMode: true,
        supportsSeed: false,
      }));
      const byId = new Map(live.map((m) => [m.id, m]));
      for (const fb of FALLBACK_MODELS) {
        const hit = byId.get(fb.id);
        if (hit) Object.assign(hit, { ...fb, displayName: hit.displayName });
      }
      return live.length ? live : FALLBACK_MODELS;
    } catch (err) {
      if (isAuthError(err)) throw new ProviderAuthError("Invalid Anthropic API key.");
      return FALLBACK_MODELS;
    }
  }

  async validateKey(apiKey: string): Promise<ValidateKeyResult> {
    if (!apiKey?.startsWith("sk-ant-")) {
      return { ok: false, error: "Anthropic keys start with 'sk-ant-'." };
    }
    try {
      const client = new Anthropic({ apiKey });
      await client.models.list({ limit: 1 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }
  }

  async complete<T>(opts: CompleteOptions): Promise<CompleteResult<T>> {
    const client = new Anthropic({ apiKey: opts.apiKey });
    const started = Date.now();

    try {
      const body: Anthropic.MessageCreateParamsNonStreaming = {
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      };
      if (supportsTemperature(opts.model)) {
        body.temperature = opts.temperature;
      }
      const resp = await client.messages.create(body, { signal: opts.signal });

      const textBlock = resp.content.find((b) => b.type === "text");
      const raw = textBlock && "text" in textBlock ? textBlock.text : "";

      const parsed = parseJsonWithSchema<T>(raw, opts.responseSchema);
      if (!parsed.ok) {
        throw new ProviderParseError(parsed.error, raw, parsed.issues);
      }

      return {
        content: parsed.value,
        raw,
        modelVersion: resp.model,
        tokensIn: resp.usage.input_tokens,
        tokensOut: resp.usage.output_tokens,
        providerRequestId: resp.id,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      if (err instanceof ProviderParseError) throw err;
      if (isAuthError(err)) throw new ProviderAuthError("Invalid Anthropic API key.");
      if (isRateLimit(err)) {
        throw new ProviderRateLimitError("Anthropic rate limit exceeded.", readRetryAfter(err));
      }
      throw err;
    }
  }

  estimateCost(modelId: string, inputTokens: number, outputTokens: number): number | null {
    const info = FALLBACK_MODELS.find((m) => m.id === modelId);
    if (!info?.inputCostPerMTok || !info.outputCostPerMTok) return null;
    return (inputTokens / 1_000_000) * info.inputCostPerMTok +
           (outputTokens / 1_000_000) * info.outputCostPerMTok;
  }
}

// Claude Opus 4.7+ rejects the `temperature` parameter. Omit it for models
// that don't accept it; fall back to the provider's default sampling.
function supportsTemperature(modelId: string): boolean {
  return !/^claude-opus-4-7/.test(modelId);
}

function isAuthError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === 401;
}

function isRateLimit(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === 429;
}

function readRetryAfter(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("headers" in err)) return undefined;
  const headers = (err as { headers?: Record<string, string> }).headers;
  const raw = headers?.["retry-after"];
  if (!raw) return undefined;
  const secs = Number(raw);
  return Number.isFinite(secs) ? secs * 1000 : undefined;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
