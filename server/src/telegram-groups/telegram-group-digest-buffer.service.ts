import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  TG_GROUP_BATCH_KEY_PREFIX,
  TG_GROUP_DIGEST_BUFFER_TTL_SECONDS,
} from './constants';

/**
 * One buffered group-broadcast event. `branchId` lets the flush cron tailor
 * the digest per group (branch-scoped groups only see their own branch).
 */
export type DigestEntry =
  | {
      kind: 'student';
      at: string; // ISO timestamp
      branchId: number | null;
      studentId: number;
      name: string;
      branchName?: string | null;
    }
  | {
      kind: 'payment';
      at: string;
      branchId: number | null;
      studentName: string;
      amount: number;
      method: string;
    }
  | {
      kind: 'group';
      at: string;
      branchId: number;
      name: string;
      branchName?: string | null;
      startDate?: string | null;
    };

/** Distributes `Omit` across the union so the discriminant is preserved. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type DigestEntryInput = DistributiveOmit<DigestEntry, 'at'>;

/**
 * Per-company Redis buffer of pending group-broadcast events.
 *
 * Event listeners `push()` low-priority events here instead of broadcasting
 * them immediately; `TelegramGroupDigestCronService` `drain()`s the buffer
 * every 3 hours and sends one consolidated message. This collapses dozens of
 * tiny "new student" / "new payment" messages into a single digest.
 */
@Injectable()
export class TelegramGroupDigestBufferService {
  private readonly logger = new Logger(TelegramGroupDigestBufferService.name);

  constructor(private readonly redis: RedisService) {}

  private key(companyId: number): string {
    return `${TG_GROUP_BATCH_KEY_PREFIX}${companyId}`;
  }

  /** Append one event to the company's buffer. Best-effort — never throws. */
  async push(companyId: number, entry: DigestEntryInput): Promise<void> {
    try {
      const stamped: DigestEntry = {
        ...entry,
        at: new Date().toISOString(),
      } as DigestEntry;
      const key = this.key(companyId);
      await this.redis
        .multi()
        .rpush(key, JSON.stringify(stamped))
        .expire(key, TG_GROUP_DIGEST_BUFFER_TTL_SECONDS)
        .exec();
    } catch (err: any) {
      this.logger.warn(
        `Failed to buffer digest entry for company ${companyId}: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Atomically read and clear the company's buffer. The `LRANGE` + `DEL` run
   * inside a single `MULTI`, so events pushed concurrently are never lost —
   * they land in a fresh list after the `DEL`.
   */
  async drain(companyId: number): Promise<DigestEntry[]> {
    const key = this.key(companyId);
    let raw: string[] = [];
    try {
      const res = await this.redis.multi().lrange(key, 0, -1).del(key).exec();
      // res = [[err, lrangeResult], [err, delResult]]
      raw = (res?.[0]?.[1] as string[] | undefined) ?? [];
    } catch (err: any) {
      this.logger.warn(
        `Failed to drain digest buffer for company ${companyId}: ${err?.message ?? err}`,
      );
      return [];
    }

    const entries: DigestEntry[] = [];
    for (const item of raw) {
      try {
        entries.push(JSON.parse(item) as DigestEntry);
      } catch {
        // Skip corrupt entries rather than dropping the whole digest.
        this.logger.warn(
          `Skipped unparseable digest entry for company ${companyId}`,
        );
      }
    }
    return entries;
  }
}
