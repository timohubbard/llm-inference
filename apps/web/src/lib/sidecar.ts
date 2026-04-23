export type DictionaryMethod = "lmd" | "mfd2" | "emolex" | "huliu" | "liwc" | "custom_dict";

export interface DictionaryScoreRequest {
  method: DictionaryMethod;
  params?: Record<string, unknown>;
  dictionary?: Record<string, string[]>;
  documents: Array<{ id: string; text: string }>;
}

export interface DictionaryMeta {
  id: string;
  name?: string;
  source?: string;
  citation?: string;
  note?: string;
  categories: string[];
  primaryCategory: string | null;
  primaryMeasure?: {
    type: "diff_ratio" | "single_category";
    positive?: string;
    negative?: string;
    category?: string;
    label: string;
  } | null;
}

export interface DictionaryScoreResponse {
  method: string;
  meta: DictionaryMeta;
  scores: Array<{
    id: string;
    categoryCounts: Record<string, number>;
    tokenCount: number;
  }>;
  summary: {
    docCount: number;
    categories: string[];
  };
  sidecarVersion: string;
  sidecarImageDigest: string | null;
  requirementsHash: string;
}

export interface RegressionRequest {
  formula: string;
  data: Array<Record<string, number | string | null>>;
  family?: "ols" | "logit";
}

export interface RegressionResponse {
  coefficients: Record<string, { estimate: number; se: number; tValue: number; pValue: number }>;
  fit: { rSquared?: number; adjRSquared?: number; llf?: number; aic?: number; bic?: number; n: number };
  residuals?: number[];
  sidecarVersion?: string;
  requirementsHash?: string;
}

function resolveUrl(path: string, req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}${path}`;
}

async function post<TReq, TResp>(path: string, body: TReq, req: Request): Promise<TResp> {
  const res = await fetch(resolveUrl(path, req), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Python function ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TResp;
}

export function scoreDictionary(payload: DictionaryScoreRequest, req: Request) {
  return post<DictionaryScoreRequest, DictionaryScoreResponse>("/api/python/dictionary", payload, req);
}

export function runRegression(payload: RegressionRequest, req: Request) {
  return post<RegressionRequest, RegressionResponse>("/api/python/regression", payload, req);
}
