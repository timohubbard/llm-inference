export interface DictionaryScoreRequest {
  method: "lmd" | "liwc" | "custom_dict";
  params?: Record<string, unknown>;
  dictionary?: Record<string, string[]>;
  documents: Array<{ id: string; text: string }>;
}

export interface DictionaryScoreResponse {
  method: string;
  scores: Array<{
    id: string;
    categoryCounts: Record<string, number>;
    tokenCount: number;
    score?: number;
  }>;
  summary: {
    docCount: number;
    categories: string[];
  };
  sidecarVersion: string;
  sidecarImageDigest: string | null;
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
}

function sidecarUrl(path: string): string {
  const base = process.env.PYTHON_SIDECAR_URL ?? "http://localhost:8000";
  return `${base.replace(/\/$/, "")}${path}`;
}

async function post<TReq, TResp>(path: string, body: TReq): Promise<TResp> {
  const res = await fetch(sidecarUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.PYTHON_SIDECAR_SHARED_SECRET
        ? { "x-sidecar-secret": process.env.PYTHON_SIDECAR_SHARED_SECRET }
        : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Python sidecar ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TResp;
}

export function scoreDictionary(req: DictionaryScoreRequest) {
  return post<DictionaryScoreRequest, DictionaryScoreResponse>("/dictionary/score", req);
}

export function runRegression(req: RegressionRequest) {
  return post<RegressionRequest, RegressionResponse>("/regression/fit", req);
}
