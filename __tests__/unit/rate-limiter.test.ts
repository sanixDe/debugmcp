import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  checkRateLimit,
  configureRateLimiter,
  resetRateLimiter,
} from "../../src/rate-limiter.js";

describe("rate-limiter", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows requests under the limit", () => {
    const result = checkRateLimit();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });

  it("tracks remaining correctly", () => {
    configureRateLimiter({ maxRequests: 5, windowMs: 60_000 });
    checkRateLimit();
    checkRateLimit();
    expect(checkRateLimit().remaining).toBe(2);
  });

  it("blocks when limit exceeded", () => {
    configureRateLimiter({ maxRequests: 2, windowMs: 60_000 });
    checkRateLimit();
    checkRateLimit();

    const result = checkRateLimit();
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows after window expires", () => {
    configureRateLimiter({ maxRequests: 1, windowMs: 100 });
    checkRateLimit();

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 200);

    expect(checkRateLimit().allowed).toBe(true);
  });

  it("resetRateLimiter clears state", () => {
    configureRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    checkRateLimit();
    expect(checkRateLimit().allowed).toBe(false);

    resetRateLimiter();
    expect(checkRateLimit().allowed).toBe(true);
    expect(checkRateLimit().remaining).toBe(58);
  });
});
