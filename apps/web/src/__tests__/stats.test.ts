import { describe, it, expect } from "vitest";
import { pearson, spearman, topDisagreements } from "../lib/stats";

describe("stats", () => {
  it("pearson of perfectly correlated series is 1", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6);
  });

  it("pearson of anti-correlated series is -1", () => {
    expect(pearson([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 6);
  });

  it("spearman agrees with pearson on ranks", () => {
    const r = spearman([10, 20, 30, 40], [1, 4, 9, 16]);
    expect(r).toBeCloseTo(1, 6);
  });

  it("topDisagreements returns largest-delta items", () => {
    const items = [
      { id: "a", x: 1, y: 1 },
      { id: "b", x: 1, y: 5 },
      { id: "c", x: 2, y: 3 },
    ];
    const top = topDisagreements(items, (i) => i.x, (i) => i.y, 2);
    expect(top[0]?.item.id).toBe("b");
    expect(top[1]?.item.id).toBe("c");
  });
});
