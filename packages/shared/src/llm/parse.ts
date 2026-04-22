import type { ZodTypeAny, z } from "zod";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; issues?: unknown };

export function parseJsonWithSchema<T>(
  raw: string,
  schema: ZodTypeAny,
): ParseResult<T> {
  const extracted = extractJsonObject(raw);
  if (!extracted) {
    return { ok: false, error: "Response did not contain a JSON object." };
  }
  let obj: unknown;
  try {
    obj = JSON.parse(extracted);
  } catch (err) {
    return {
      ok: false,
      error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const result = schema.safeParse(obj);
  if (!result.success) {
    return {
      ok: false,
      error: `Schema validation failed: ${result.error.issues.map((i: z.ZodIssue) => i.message).join("; ")}`,
      issues: result.error.issues,
    };
  }
  return { ok: true, value: result.data as T };
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);
  return null;
}
