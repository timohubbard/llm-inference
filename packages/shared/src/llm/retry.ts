import { ProviderParseError } from "./provider";
import type { CompleteOptions, CompleteResult, LlmProvider } from "./provider";

export interface RetryMetadata {
  attempts: number;
  parseFailures: number;
}

export async function completeWithRetry<T>(
  provider: LlmProvider,
  opts: CompleteOptions,
  maxParseRetries = 2,
): Promise<{ result: CompleteResult<T>; meta: RetryMetadata }> {
  let parseFailures = 0;
  let attempts = 0;
  let messages = opts.messages;

  for (;;) {
    attempts++;
    try {
      const result = await provider.complete<T>({ ...opts, messages });
      return { result, meta: { attempts, parseFailures } };
    } catch (err) {
      if (err instanceof ProviderParseError && parseFailures < maxParseRetries) {
        parseFailures++;
        messages = [
          ...messages,
          { role: "assistant", content: err.raw },
          {
            role: "user",
            content: `The previous response failed JSON schema validation: ${err.message}. Return ONLY the corrected JSON object, no prose or code fences.`,
          },
        ];
        continue;
      }
      throw err;
    }
  }
}
