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
