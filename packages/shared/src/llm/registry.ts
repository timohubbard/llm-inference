import { AnthropicProvider } from "./providers/anthropic";
import { OpenAIProvider } from "./providers/openai";
import { GoogleProvider } from "./providers/google";
import type { LlmProvider, ProviderId } from "./provider";

const providers: Record<ProviderId, LlmProvider> = {
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider("openai"),
  "openai-compat": new OpenAIProvider("openai-compat"),
  google: new GoogleProvider(),
};

export function getProvider(id: ProviderId): LlmProvider {
  const p = providers[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function listProviders(): Array<{ id: ProviderId; displayName: string }> {
  return Object.values(providers).map((p) => ({ id: p.id, displayName: p.displayName }));
}
