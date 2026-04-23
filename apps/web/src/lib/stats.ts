// Lightweight correlation utilities used by the deviation-analysis view.
// We avoid a stats library for this — Pearson and rank-correlation are small
// and self-contained, and keeping them client-side means deviation analysis
// never has to leave the browser with the raw scores.

export function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let xSq = 0;
  let ySq = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - xMean;
    const dy = (ys[i] ?? 0) - yMean;
    num += dx * dy;
    xSq += dx * dx;
    ySq += dy * dy;
  }
  const denom = Math.sqrt(xSq * ySq);
  return denom === 0 ? null : num / denom;
}

function ranks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const r = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1]!.v === indexed[i]!.v) j++;
    const tiedRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[indexed[k]!.i] = tiedRank;
    i = j + 1;
  }
  return r;
}

export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  return pearson(ranks(xs), ranks(ys));
}

// Intraclass correlation, ICC(2,1) — two-way random, absolute agreement,
// single rater. Shrout & Fleiss (1979) formulation. `a` and `b` are paired
// observations (one per target, two raters). Returns null when undefined
// (e.g. fewer than 2 observations or zero total variance).
export function icc21(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const n = a.length;
  const k = 2;
  const rowMeans: number[] = [];
  let grandSum = 0;
  for (let i = 0; i < n; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    rowMeans.push((ai + bi) / 2);
    grandSum += ai + bi;
  }
  const grandMean = grandSum / (n * k);
  const colMeanA = a.reduce((s, v) => s + v, 0) / n;
  const colMeanB = b.reduce((s, v) => s + v, 0) / n;
  let ssBetweenRows = 0;
  for (const rm of rowMeans) ssBetweenRows += (rm - grandMean) ** 2;
  ssBetweenRows *= k;
  const ssBetweenCols = n * ((colMeanA - grandMean) ** 2 + (colMeanB - grandMean) ** 2);
  let ssTotal = 0;
  for (let i = 0; i < n; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    ssTotal += (ai - grandMean) ** 2 + (bi - grandMean) ** 2;
  }
  const ssError = ssTotal - ssBetweenRows - ssBetweenCols;
  const msBetweenRows = ssBetweenRows / (n - 1);
  const msBetweenCols = ssBetweenCols / (k - 1);
  const msError = ssError / ((n - 1) * (k - 1));
  const denom = msBetweenRows + (k - 1) * msError + (k * (msBetweenCols - msError)) / n;
  if (denom === 0 || !isFinite(denom)) return null;
  return (msBetweenRows - msError) / denom;
}

export function topDisagreements<T>(
  items: T[],
  getX: (t: T) => number,
  getY: (t: T) => number,
  n: number,
): Array<{ item: T; delta: number }> {
  return items
    .map((item) => ({ item, delta: Math.abs(getX(item) - getY(item)) }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, n);
}
