// ============================================================
// In-memory sliding-window rate limiter
// ============================================================

export interface RateLimiterConfig {
  readonly maxRequests: number;
  readonly windowMs: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterMs?: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequests: 60,
  windowMs: 60_000,
};

const timestamps: number[] = [];
let config: RateLimiterConfig = DEFAULT_CONFIG;

export function configureRateLimiter(newConfig: Partial<RateLimiterConfig>): void {
  config = { ...config, ...newConfig };
}

export function resetRateLimiter(): void {
  timestamps.length = 0;
  config = DEFAULT_CONFIG;
}

function prune(now: number): void {
  const cutoff = now - config.windowMs;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
}

export function checkRateLimit(): RateLimitResult {
  const now = Date.now();
  prune(now);

  if (timestamps.length >= config.maxRequests) {
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  timestamps.push(now);
  return {
    allowed: true,
    remaining: config.maxRequests - timestamps.length,
  };
}
