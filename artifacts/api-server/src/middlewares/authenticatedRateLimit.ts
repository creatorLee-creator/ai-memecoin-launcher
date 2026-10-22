import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

/**
 * Best-effort per-process abuse protection for authenticated demo endpoints.
 * Production deployments with multiple instances need a shared Redis/database
 * rate limiter at the edge or application layer.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

export function authenticatedRateLimit(
  action: string,
  maxRequestsPerMinute: number,
): RequestHandler {
  return (req, res, next) => {
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const now = Date.now();
    const key = `${action}:${userId}`;
    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      if (buckets.size >= MAX_BUCKETS) {
        for (const [existingKey, value] of buckets) {
          if (now >= value.resetAt) buckets.delete(existingKey);
        }
      }
      if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
        res.status(503).json({ error: "Rate limiter temporarily unavailable" });
        return;
      }
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      buckets.set(key, bucket);
    }

    if (bucket.count >= maxRequestsPerMinute) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      res.status(429).json({ error: "Too many requests. Please try again shortly." });
      return;
    }

    bucket.count += 1;
    next();
  };
}
