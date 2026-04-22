import OpenAI from "openai";
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

const OPENAI_COMPAT_SUPPORTS_SEED = true;

export class OpenAIProvider implements LlmProvider {
  id: "openai" | "openai-compat";
  displayName: string;

  constructor(variant: "openai" | "openai-compat" = "openai") {
    this.id = variant;
    this.displayName = variant === "openai" ? "OpenAI" : "OpenAI-compatible";
  }

  async listModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
    const client = new OpenAI({ apiKey, baseURL: baseUrl });
    try {
      const res = await client.models.list();
      return res.data.map<ModelInfo>((m) => ({
        id: m.id,
        displayName: m.id,
        supportsJsonMode: true,
        supportsSeed: OPENAI_COMPAT_SUPPORTS_SEED,
      }));
    } catch (err) {
      if (isAuthError(err)) throw new ProviderAuthError("Invalid API key.");
      throw err;
    }
  }

  async validateKey(apiKey: string, baseUrl?: string): Promise<ValidateKeyResult> {
    try {
      const client = new OpenAI({ apiKey, baseURL: baseUrl });
      await client.models.list();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async complete<T>(opts: CompleteOptions): Promise<CompleteResult<T>> {
    const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseUrl });
    const started = Date.now();

    try {
      const resp = await client.chat.completions.create(
        {
          model: opts.model,
          max_tokens: opts.maxTokens,
          temperature: opts.temperature,
          seed: opts.seed,
          response_format: { type: "json_object" },
          messages: [
            ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
            ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        },
        { signal: opts.signal },
      );

      const raw = resp.choices[0]?.message.content ?? "";
      const parsed = parseJsonWithSchema<T>(raw, opts.responseSchema);
      if (!parsed.ok) throw new ProviderParseError(parsed.error, raw, parsed.issues);

      return {
        content: parsed.value,
        raw,
        modelVersion: resp.model,
        tokensIn: resp.usage?.prompt_tokens ?? 0,
        tokensOut: resp.usage?.completion_tokens ?? 0,
        providerRequestId: resp.id,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      if (err instanceof ProviderParseError) throw err;
      if (isAuthError(err)) throw new ProviderAuthError("Invalid API key.");
      if (isRateLimit(err)) throw new ProviderRateLimitError("Rate limit exceeded.");
      throw err;
    }
  }

  estimateCost(): number | null {
    return null;
  }
}

function isAuthError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === 401;
}

function isRateLimit(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === 429;
}
