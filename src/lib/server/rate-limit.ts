interface Bucket {
  count: number;
  resetAtMs: number;
}

interface RateLimitInput {
  key: string;
  maxAttempts: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function cleanupExpired(nowMs: number) {
  if (buckets.size < MAX_BUCKETS) {
    return;
  }

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAtMs <= nowMs) {
      buckets.delete(key);
    }
  }
}

export function consumeRateLimit(input: RateLimitInput): RateLimitResult {
  const nowMs = Date.now();
  cleanupExpired(nowMs);

  const existing = buckets.get(input.key);
  if (!existing || existing.resetAtMs <= nowMs) {
    buckets.set(input.key, {
      count: 1,
      resetAtMs: nowMs + input.windowMs,
    });

    return {
      allowed: true,
      remaining: Math.max(0, input.maxAttempts - 1),
      retryAfterSeconds: 0,
    };
  }

  if (existing.count >= input.maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000)),
    };
  }

  existing.count += 1;
  buckets.set(input.key, existing);

  return {
    allowed: true,
    remaining: Math.max(0, input.maxAttempts - existing.count),
    retryAfterSeconds: 0,
  };
}

export function clearRateLimit(key: string) {
  buckets.delete(key);
}
