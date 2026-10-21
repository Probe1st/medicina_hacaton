import { RateLimiterMemory, type RateLimiterRes } from "rate-limiter-flexible";

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfter?: number;
}

export class AuthRateLimiters {
  public ipLimiter: RateLimiterMemory;
  public usernameLimiter: RateLimiterMemory;
  public passwordChangeLimiter: RateLimiterMemory;

  constructor() {
    this.ipLimiter = new RateLimiterMemory({
      points: 20,
      duration: 60,
    });
    this.usernameLimiter = new RateLimiterMemory({
      points: 5,
      duration: 900,
    });
    this.passwordChangeLimiter = new RateLimiterMemory({
      points: 5,
      duration: 900,
    });
  }

  async checkLogin(ip: string, username: string): Promise<RateLimitCheckResult> {
    let blocked = false;
    let maxRetryAfter = 0;

    try {
      await this.ipLimiter.consume(ip);
    } catch (err) {
      blocked = true;
      const res = err as RateLimiterRes;
      maxRetryAfter = Math.max(maxRetryAfter, Math.ceil(res.msBeforeNext / 1000));
    }

    try {
      await this.usernameLimiter.consume(username);
    } catch (err) {
      blocked = true;
      const res = err as RateLimiterRes;
      maxRetryAfter = Math.max(maxRetryAfter, Math.ceil(res.msBeforeNext / 1000));
    }

    if (blocked) {
      return {
        allowed: false,
        retryAfter: Math.max(1, maxRetryAfter),
      };
    }

    return { allowed: true };
  }

  async checkPasswordChange(userId: string): Promise<RateLimitCheckResult> {
    try {
      await this.passwordChangeLimiter.consume(userId);
      return { allowed: true };
    } catch (err) {
      const res = err as RateLimiterRes;
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil(res.msBeforeNext / 1000)),
      };
    }
  }
}
