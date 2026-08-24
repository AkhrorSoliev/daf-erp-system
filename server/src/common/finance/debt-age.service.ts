import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { replayDebtOrigin } from './debt-origin';
import { assertCallerMayTouchStudent } from '../auth/student-branch-scope';
import { secondsUntilTashkentMidnight } from '../../reports/net-profit-cache';

/** One student's debt, dated and split by where it came from. */
export interface DebtAge {
  /** ISO instant the unbroken debt streak began. */
  since: string;
  /** Origin month → still-unpaid amount, disjoint, summing to the live debt. */
  months: Record<string, number>;
}

type DebtAgeMap = Record<string, DebtAge>;

/**
 * ioredis queues commands while it is disconnected and only rejects once the
 * connection finally gives up, so an unreachable Redis costs SECONDS per call,
 * not milliseconds — measured at ~40s for one read plus one write against a
 * local server with no Redis running. A cache that can make the page slower
 * than not having it is worse than no cache, hence the races below.
 */
const CACHE_READ_TIMEOUT_MS = 300;
const CACHE_WRITE_TIMEOUT_MS = 1000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`kesh ${ms}ms ichida javob bermadi`)),
        ms,
      ),
    ),
  ]);
}

/**
 * "Qachondan beri" for the debtors list.
 *
 * Answering it exactly means replaying every balance-moving row a debtor has
 * ever had, because payments settle the oldest charge first — a balance does
 * not carry its own history. That is one query over the whole company's
 * debtors, far too heavy to run on each page of a paginated list.
 *
 * So it runs at most once per Tashkent day and the result is cached whole. A
 * day is the right granularity for the same reason it is right for net profit:
 * the answer is a count of months, and a payment landing at noon does not
 * change how many months someone has owed for. What a payment DOES change —
 * the debt figure itself — is read live from `Student.balance` by the list,
 * never from here.
 *
 * The cache is an optimisation, never a dependency: a Redis outage means the
 * next request computes the map again, not that the column disappears.
 */
@Injectable()
export class DebtAgeService {
  private readonly logger = new Logger(DebtAgeService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private key(companyId: number): string {
    return `dbt:age:${companyId}`;
  }

  async getDebtAges(companyId: number): Promise<Map<number, DebtAge>> {
    const key = this.key(companyId);

    try {
      const hit = await withTimeout(this.redis.get(key), CACHE_READ_TIMEOUT_MS);
      if (hit) return toMap(JSON.parse(hit) as DebtAgeMap);
    } catch (e) {
      this.logger.warn(`Kesh o'qilmadi (${key}): ${e}`);
    }

    const computed = await this.compute(companyId);

    // Fire-and-forget. The caller already has the answer; making them wait for
    // the write only adds the cache's failure modes to a request that has
    // already succeeded without it.
    void withTimeout(
      this.redis.setex(
        key,
        secondsUntilTashkentMidnight(),
        JSON.stringify(computed),
      ),
      CACHE_WRITE_TIMEOUT_MS,
    ).catch((e) => this.logger.warn(`Kesh yozilmadi (${key}): ${e}`));

    return toMap(computed);
  }

  /**
   * One student's answer, for their profile page.
   *
   * Reads the day's cached map when it is warm, so the profile and the debtors
   * list say the same thing about the same person. When it is cold it replays
   * just this student instead of the whole company — a profile visit must not
   * pay for 422 people's ledgers, and in that case the live answer is the
   * better one anyway.
   */
  async getForStudent(
    companyId: number,
    studentId: number,
    userId?: number,
  ): Promise<DebtAge | null> {
    // Branch guard, same as every other id-addressed student read: this returns
    // how much someone owes and since when, so a director must not reach it by
    // typing another branch's id into the URL.
    await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );
    try {
      const hit = await withTimeout(
        this.redis.get(this.key(companyId)),
        CACHE_READ_TIMEOUT_MS,
      );
      if (hit) {
        const map = JSON.parse(hit) as DebtAgeMap;
        return map[studentId] ?? null;
      }
    } catch (e) {
      this.logger.warn(`Kesh o'qilmadi (bitta o'quvchi): ${e}`);
    }

    const rows = await this.prisma.transaction.findMany({
      where: { companyId, studentId, amount: { not: 0 } },
      select: { studentId: true, type: true, amount: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const origin = replayDebtOrigin(rows);
    if (!origin.since) return null;
    return {
      since: origin.since.toISOString(),
      months: Object.fromEntries(origin.byMonth),
    };
  }

  private async compute(companyId: number): Promise<DebtAgeMap> {
    // Debtors only. A student who owes nothing has no streak to date, and
    // walking every student in the company would multiply the cost for rows
    // that would be dropped anyway.
    const debtors = await this.prisma.student.findMany({
      where: { companyId, balance: { lt: 0 } },
      select: { id: true },
    });
    if (debtors.length === 0) return {};

    const ids = debtors.map((d) => d.id);
    // `amount: { not: 0 }` drops LESSON_CONSUMPTION — the one row type written
    // without a balance lock. Reversals are NOT filtered: the counter-row
    // carries the original's type, so keeping both nets them to zero while
    // dropping one half would leave the undo without its original.
    const rows = await this.prisma.transaction.findMany({
      where: { companyId, studentId: { in: ids }, amount: { not: 0 } },
      select: { studentId: true, type: true, amount: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const perStudent = new Map<number, typeof rows>();
    for (const r of rows) {
      if (r.studentId == null) continue;
      const list = perStudent.get(r.studentId);
      if (list) list.push(r);
      else perStudent.set(r.studentId, [r]);
    }

    const out: DebtAgeMap = {};
    for (const id of ids) {
      const origin = replayDebtOrigin(perStudent.get(id) ?? []);
      if (!origin.since) continue;
      out[id] = {
        since: origin.since.toISOString(),
        months: Object.fromEntries(origin.byMonth),
      };
    }
    return out;
  }
}

function toMap(obj: DebtAgeMap): Map<number, DebtAge> {
  return new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]));
}
