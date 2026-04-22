import type { ZodTypeAny } from "zod";

export type ProviderId = "anthropic" | "openai" | "openai-compat" | "google";

export interface ModelInfo {
  id: string;
  displayName: string;
  contextWindow?: number;
  supportsJsonMode?: boolean;
  supportsSeed?: boolean;
  inputCostPerMTok?: number;
  outputCostPerMTok?: number;
}

export interface CompleteOptions {
  apiKey: string;
  model: string;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  responseSchema: ZodTypeAny;
  temperature: number;
  seed?: number;
  maxTokens: number;
  signal?: AbortSignal;
  baseUrl?: string;
}

export interface CompleteResult<T = unknown> {
  content: T;
  raw: string;
  modelVersion?: string;
  tokensIn: number;
  tokensOut: number;
  providerRequestId?: string;
  latencyMs: number;
}

export interface ValidateKeyResult {
  ok: boolean;
  error?: string;
}

export interface LlmProvider {
  id: ProviderId;
  displayName: string;

  listModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]>;
  validateKey(apiKey: string, baseUrl?: string): Promise<ValidateKeyResult>;
  complete<T = unknown>(opts: CompleteOptions): Promise<CompleteResult<T>>;
  estimateCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number,
  ): number | null;
}

export class ProviderParseError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
    public readonly zodIssues?: unknown,
  ) {
    super(message);
    this.name = "ProviderParseError";
  }
}

export class ProviderAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderAuthError";
  }
}

export class ProviderRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderRateLimitError";
  }
}
