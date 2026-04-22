import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  type CompleteOptions,
  type CompleteResult,
  type LlmProvider,
  type ModelInfo,
  ProviderAuthError,
  ProviderParseError,
  type ValidateKeyResult,
} from "../provider";
import { parseJsonWithSchema } from "../parse";

const FALLBACK_MODELS: ModelInfo[] = [
  { id: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", supportsJsonMode: true, supportsSeed: false },
  { id: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", supportsJsonMode: true, supportsSeed: false },
];

export class GoogleProvider implements LlmProvider {
  id = "google" as const;
  displayName = "Google Gemini";

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    );
    if (res.status === 401 || res.status === 403) {
      throw new ProviderAuthError("Invalid Google API key.");
    }
    if (!res.ok) return FALLBACK_MODELS;
    const data = (await res.json()) as { models?: Array<{ name: string; displayName?: string }> };
    const models = (data.models ?? [])
      .filter((m) => m.name.includes("gemini"))
      .map<ModelInfo>((m) => ({
        id: m.name.replace(/^models\//, ""),
        displayName: m.displayName ?? m.name,
        supportsJsonMode: true,
        supportsSeed: false,
      }));
    return models.length ? models : FALLBACK_MODELS;
  }

  async validateKey(apiKey: string): Promise<ValidateKeyResult> {
    try {
      await this.listModels(apiKey);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async complete<T>(opts: CompleteOptions): Promise<CompleteResult<T>> {
    const client = new GoogleGenerativeAI(opts.apiKey);
    const model = client.getGenerativeModel({
      model: opts.model,
      generationConfig: {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens,
        responseMimeType: "application/json",
      },
      systemInstruction: opts.system,
    });
    const started = Date.now();
    const prompt = opts.messages.map((m) => m.content).join("\n\n");
    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    const parsed = parseJsonWithSchema<T>(raw, opts.responseSchema);
    if (!parsed.ok) throw new ProviderParseError(parsed.error, raw, parsed.issues);
    const usage = result.response.usageMetadata;
    return {
      content: parsed.value,
      raw,
      modelVersion: opts.model,
      tokensIn: usage?.promptTokenCount ?? 0,
      tokensOut: usage?.candidatesTokenCount ?? 0,
      latencyMs: Date.now() - started,
    };
  }

  estimateCost(): number | null {
    return null;
  }
}
