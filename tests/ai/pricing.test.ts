import { describe, expect, it } from "vitest";
import { aiCostUsd } from "@/lib/ai/pricing";

describe("aiCostUsd", () => {
  it("bills cached input at the cached rate", () => {
    // 2,500 input (1,500 cached) + 80 output on gpt-5.4-mini
    const cost = aiCostUsd("gpt-5.4-mini", { inputTokens: 2500, cachedInputTokens: 1500, outputTokens: 80 });
    expect(cost).toBeCloseTo((1000 * 0.75 + 1500 * 0.075 + 80 * 4.5) / 1e6, 10);
  });

  it("prices the fallback model by its own rates", () => {
    const usage = { inputTokens: 2500, cachedInputTokens: 0, outputTokens: 80 };
    expect(aiCostUsd("gpt-5.5", usage)).toBeCloseTo((2500 * 5 + 80 * 30) / 1e6, 10);
    expect(aiCostUsd("gpt-5.5", usage)).toBeGreaterThan(aiCostUsd("gpt-5.4-mini", usage) * 6);
  });

  it("never bills more cached tokens than the input", () => {
    const cost = aiCostUsd("gpt-5.4-mini", { inputTokens: 100, cachedInputTokens: 500, outputTokens: 0 });
    expect(cost).toBeCloseTo((100 * 0.075) / 1e6, 10);
  });
});
