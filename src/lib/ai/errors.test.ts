import { describe, expect, it } from "vitest";
import {
  AiRateLimitError,
  friendlyAiError,
  isModelUnavailable,
  isRateLimit,
  retryDelayMs,
} from "./errors";

function apiError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

describe("AI error helpers", () => {
  it("reads the retry delay from a Gemini error", () => {
    const e = apiError(429, '{"error":{"details":[{"retryDelay":"23s"}]}}');
    expect(retryDelayMs(e)).toBe(23_500);
    expect(retryDelayMs(new Error("x"), 5000)).toBe(5000);
  });

  it("detects rate limits and unavailable models", () => {
    expect(isRateLimit(apiError(429, "Too many"))).toBe(true);
    expect(isRateLimit(apiError(400, "RESOURCE_EXHAUSTED"))).toBe(true);
    expect(isRateLimit(apiError(400, "bad"))).toBe(false);
    expect(isModelUnavailable(apiError(404, "models/x is not found"))).toBe(true);
    expect(isModelUnavailable(apiError(400, "bad"))).toBe(false);
  });

  it("never leaks details in friendly messages", () => {
    expect(friendlyAiError(new AiRateLimitError(1000))).toMatch(/limit/);
    expect(friendlyAiError(apiError(400, "API key not valid. AIza..."))).not.toContain("AIza");
  });
});
