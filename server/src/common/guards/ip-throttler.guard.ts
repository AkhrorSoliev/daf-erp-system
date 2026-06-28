import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard that keys the rate-limit on the REAL client IP behind a
 * reverse proxy (Railway/Vercel). Express `req.ip` is the proxy's address
 * unless `trust proxy` is enabled — which would collapse every client into a
 * single bucket and lock the whole world out once the limit trips. We read the
 * first `x-forwarded-for` hop instead (same source the forgot-password flow
 * already trusts for its own per-IP limits), falling back to `req.ip` locally.
 */
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const fwd = req?.headers?.['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) {
      return Promise.resolve(fwd.split(',')[0].trim());
    }
    return Promise.resolve(req?.ip ?? 'unknown');
  }
}
