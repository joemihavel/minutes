import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { AppError } from "./errors";

type LimitName = "read" | "write" | "upload" | "chat" | "public";

const settings: Record<LimitName, { requests: number; window: `${number} ${"s" | "m" | "h"}` }> = {
  read: { requests: 120, window: "1 m" },
  write: { requests: 40, window: "1 m" },
  upload: { requests: 8, window: "1 h" },
  chat: { requests: 30, window: "1 m" },
  public: { requests: 90, window: "1 m" },
};

let redis: Redis | null = null;
const limiters = new Map<LimitName, Ratelimit>();

function getRedis() {
  if (!redis) {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error("Redis is not configured");
    redis = new Redis({ url, token });
  }
  return redis;
}

function getLimiter(name: LimitName) {
  let limiter = limiters.get(name);
  if (!limiter) {
    const config = settings[name];
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(config.requests, config.window),
      prefix: `minutes:${name}`,
      analytics: false,
    });
    limiters.set(name, limiter);
  }
  return limiter;
}

export async function enforceRateLimit(name: LimitName, identity: string) {
  const result = await getLimiter(name).limit(identity);
  if (!result.success) {
    throw new AppError(
      "Too many requests. Please wait a moment and try again.",
      429,
      "RATE_LIMITED",
    );
  }
  return result;
}
