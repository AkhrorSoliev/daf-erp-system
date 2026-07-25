import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryPaymentStatus, SalaryType, Prisma } from '@prisma/client';
import {
  resolveCompletedPeriod,
  resolveCurrentPeriod,
} from './shared/resolve-current-period';
import {
  isTopUpPeriod,
  NEW_STUDENT_TOPUP_MIN_LESSONS,
  topUpEraStartDate,
} from './shared/topup';
import {
  perLessonAccrual,
  pickActiveVersion,
  RateVersion,
} from './shared/deserved-math';
import { prorateFixedMonthly } from './shared/prorate-fixed-monthly';
import { SalaryAccrualService } from './salary-accrual.service';

/** One uncovered billable lesson to be fronted by a center top-up accrual. */
interface GapSpec {
  studentId: number;
  groupId: string;
  attendanceId: string;
  lessonDate: Date;
  perLessonCost: number;
  // BR-09b: for a backfilled (retroactively-unlocked) lesson whose own period
  // has closed, the current open period start to credit it to. Undefined for an
  // ordinary in-period gap (bucketed by lessonDate).
  creditPeriodDate?: Date;
}

@Injectable()
export class SalaryCalculationService {
  private readonly logger = new Logger(SalaryCalculationService.name);

  constructor(
    private prisma: PrismaService,
    private salaryAccrualService: SalaryAccrualService,
  ) {}

  /**
   * Settle one payroll period.
   *
   * Two entry modes:
   * - **Cron (no `asOfDate`)** — settles the period that has just FINISHED via
   *   `resolveCompletedPeriod`. The cron fires on cycleStartDay, when the
   *   "current" period is the one just starting; paying that would settle an
   *   almost-empty window and strand the month that just ended.
   * - **Manual (`asOfDate` given)** — the CEO picks the period directly by
   *   passing any date INSIDE it. We resolve via `resolveCurrentPeriod` (the
   *   period that date falls in), NOT `resolveCompletedPeriod`, so "enter a
   *   day in May → settle May". Mixing the two is the biggest off-by-one
   *   footgun, so each caller states its intent explicitly.
   *
   * Bounds come from SalaryPeriodSetting (per-company cycleStartDay; default
   * 8th→7th if no setting exists), so the same configured boundaries drive
   * both modes.
   *
   * Idempotent per (userId, periodStart, periodEnd): re-running a period folds
   * any newly-eligible accruals into the existing CALCULATED draft instead of
   * creating a duplicate payment. Users whose payment for the period is already
   * APPROVED/PAID (closed) are skipped — late accruals there are handled by the
   * carry-over mechanism in `createAccrual`, never by recalculation.
   */
  async calculateMonthlySalaries(
    companyId: number,
    opts: { asOfDate?: Date; now?: Date } = {},
  ) {
    // `now` is injectable for deterministic tests; production passes nothing.
    const now = opts.now ?? new Date();
    const { periodStart, periodEnd } = opts.asOfDate
      ? await resolveCurrentPeriod(this.prisma, companyId, opts.asOfDate)
      : await resolveCompletedPeriod(this.prisma, companyId, now);

    // Never settle a period that has not finished yet — it would pay a
    // half-open window. The cron path can't hit this (`resolveCompletedPeriod`
    // is always in the past); the manual path can, so guard it.
    if (periodEnd.getTime() > now.getTime()) {
      throw new BadRequestException(
        "Tugamagan davrni hisoblab bo'lmaydi — davr hali yakunlanmagan",
      );
    }

    // Phase 0 — center top-up (full-deserved payroll, July 2026+). Front the
    // teacher's pay for every uncovered ("gap") billable lesson in the period by
    // writing center-funded SalaryAccrual rows. They are ordinary unlinked
    // accruals, so the accrual sweep + payment loop below pick them up exactly
    // like student-covered ones — the payment's gross becomes the FULL deserved
    // salary. Periods before the switch keep the covered-only behaviour intact.
    if (isTopUpPeriod(periodStart)) {
      await this.writeCenterTopUpAccruals(companyId, periodStart, periodEnd);
    }

    const results: {
      userId: number;
      amount: number;
      advanceDeducted: number;
      kind: 'ACCRUAL' | 'FIXED_MONTHLY';
      action: 'CREATED' | 'MERGED';
    }[] = [];
    // Users whose payment for this period is already APPROVED/PAID and so was
    // skipped (closed window). Surfaced in the result so the caller/UI can show
    // "N ta o'tkazib yuborildi (allaqachon to'langan)".
    const skipped: number[] = [];

    // === ACCRUAL-BASED (teachers) ===
    // - Effective payroll date = COALESCE(creditPeriodDate, lessonDate),
    //   expressed as a two-branch OR. Most accruals have creditPeriodDate=NULL
    //   and bucket by their lessonDate (unchanged). Carry-over accruals (a late
    //   payment settled a lesson whose own period was already closed) have
    //   creditPeriodDate set to an open-period start, so they land in THIS run.
    // - reversedAt: null excludes accruals that were undone (cancelled
    //   lesson, attendance flipped to ABSENT, etc.) so we don't pay for them.
    const accruals = await this.prisma.salaryAccrual.findMany({
      where: {
        companyId,
        salaryPaymentId: null,
        reversedAt: null,
        OR: [
          { creditPeriodDate: { gte: periodStart, lte: periodEnd } },
          {
            creditPeriodDate: null,
            lessonDate: { gte: periodStart, lte: periodEnd },
          },
        ],
      },
      select: {
        id: true,
        userId: true,
        amount: true,
      },
    });

    const byUser = new Map<number, { ids: string[]; total: number }>();
    for (const a of accruals) {
      const entry = byUser.get(a.userId) ?? { ids: [], total: 0 };
      entry.ids.push(a.id);
      entry.total += a.amount;
      byUser.set(a.userId, entry);
    }

    for (const [userId, { ids }] of byUser) {
      // Atomic: existence check + SalaryPayment create/merge + accrual link +
      // advance settlement are all-or-nothing. The existence check runs INSIDE
      // the Serializable tx so a concurrent run (manual + cron) can't both
      // create a payment for the same (userId, periodStart, periodEnd).
      const outcome = await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.salaryPayment.findFirst({
            where: { userId, companyId, periodStart, periodEnd },
            select: { id: true, status: true },
          });

          // Closed window — never recalc. Late accruals for a closed period are
          // carried over by `createAccrual`, so they should not even reach here;
          // skip defensively (and leave them unlinked for the next open run).
          if (
            existing &&
            (existing.status === SalaryPaymentStatus.APPROVED ||
              existing.status === SalaryPaymentStatus.PAID)
          ) {
            return { skipped: true as const };
          }

          // Re-run / backfill: fold the new accruals into the existing
          // CALCULATED draft. Otherwise create a fresh draft. Either way, link
          // this run's accruals to that payment.
          const paymentId =
            existing?.id ??
            (
              await tx.salaryPayment.create({
                data: {
                  userId,
                  periodStart,
                  periodEnd,
                  amount: 0,
                  status: SalaryPaymentStatus.CALCULATED,
                  companyId,
                },
              })
            ).id;

          await tx.salaryAccrual.updateMany({
            where: { id: { in: ids } },
            data: { salaryPaymentId: paymentId },
          });

          // Recompute gross authoritatively from ALL non-reversed accruals now
          // linked to this payment (not `+=`), so a reversed accrual correctly
          // drops out of the total on a re-run.
          const linked = await tx.salaryAccrual.aggregate({
            where: { salaryPaymentId: paymentId, reversedAt: null },
            _sum: { amount: true },
          });
          const gross = linked._sum.amount ?? 0;

          // Advances already settled against THIS payment stay settled; only
          // top up with still-pending advances against the (possibly grown)
          // gross. `applyPendingAdvances` filters `settledBySalaryPaymentId:
          // null`, so it never re-settles what this payment already absorbed.
          const alreadySettled = await tx.expense.aggregate({
            where: {
              settledBySalaryPaymentId: paymentId,
              category: 'TEACHER_ADVANCE',
              deletedAt: null,
            },
            _sum: { amount: true },
          });
          const alreadySettledTotal = alreadySettled._sum.amount ?? 0;

          const newlyDeducted = await this.applyPendingAdvances(
            tx,
            { id: paymentId, amount: gross - alreadySettledTotal },
            userId,
            companyId,
          );

          const finalNet = gross - alreadySettledTotal - newlyDeducted;
          // applyPendingAdvances only updates `amount` when it settles
          // something; set the authoritative net explicitly so create (amount=0)
          // and no-advance re-runs both land on the right figure.
          await tx.salaryPayment.update({
            where: { id: paymentId },
            data: { amount: finalNet },
          });

          return {
            skipped: false as const,
            finalNet,
            advanceDeducted: alreadySettledTotal + newlyDeducted,
            action: existing ? ('MERGED' as const) : ('CREATED' as const),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      if (outcome.skipped) {
        skipped.push(userId);
        continue;
      }

      results.push({
        userId,
        amount: outcome.finalNet,
        advanceDeducted: outcome.advanceDeducted,
        kind: 'ACCRUAL',
        action: outcome.action,
      });
    }

    // === FIXED MONTHLY (admins, cashiers, branch directors, or teachers on fixed salary) ===
    // isActive is NOT filtered: a staff member deactivated mid-cycle must still
    // receive their final (prorated) month — the version's `effectiveTo` bounds
    // the money and future months prorate to 0. The 4b deactivation cascade
    // guarantees a deactivated config's version is always closed. `deletedAt:
    // null` on the user is the hard guard so an archived/removed employee is
    // never paid.
    const fixedMonthlyConfigs = await this.prisma.employeeSalaryConfig.findMany(
      {
        where: {
          companyId,
          groupId: null,
          salaryType: SalaryType.FIXED_MONTHLY,
          user: { deletedAt: null },
        },
        select: { id: true, userId: true },
      },
    );

    for (const config of fixedMonthlyConfigs) {
      // Prorate over every FIXED_MONTHLY version overlapping the settled period
      // (mid-cycle hire via effectiveFrom, leave via effectiveTo, rate change =
      // two versions). Same helper the report uses, so shown == paid. No
      // overlapping version → amount 0 → skip (employee wasn't on fixed-monthly
      // this cycle).
      const versions = await this.prisma.employeeSalaryConfigVersion.findMany({
        where: {
          configId: config.id,
          salaryType: SalaryType.FIXED_MONTHLY,
          effectiveFrom: { lte: periodEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: periodStart } }],
        },
        select: { value: true, effectiveFrom: true, effectiveTo: true },
      });
      const amount = prorateFixedMonthly(versions, periodStart, periodEnd);
      if (amount <= 0) continue;

      // Skip if a payment already exists for this exact period (idempotent cron).
      const existing = await this.prisma.salaryPayment.findFirst({
        where: {
          userId: config.userId,
          companyId,
          periodStart,
          periodEnd,
        },
        select: { id: true },
      });
      if (existing) continue;

      // Atomic for the same reasons as the accrual branch above.
      const { finalNet, advanceDeducted } = await this.prisma.$transaction(
        async (tx) => {
          const salaryPayment = await tx.salaryPayment.create({
            data: {
              userId: config.userId,
              periodStart,
              periodEnd,
              amount,
              status: SalaryPaymentStatus.CALCULATED,
              companyId,
            },
          });

          const advanceDeducted = await this.applyPendingAdvances(
            tx,
            { id: salaryPayment.id, amount },
            config.userId,
            companyId,
          );
          return {
            finalNet: amount - advanceDeducted,
            advanceDeducted,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      results.push({
        userId: config.userId,
        amount: finalNet,
        advanceDeducted,
        kind: 'FIXED_MONTHLY',
        action: 'CREATED',
      });
    }

    return {
      calculated: results.length,
      skipped: skipped.length,
      periodStart,
      periodEnd,
      details: results,
      skippedUserIds: skipped,
    };
  }

  /**
   * Resolve the period a manually-picked date falls inside, without mutating
   * anything. Powers the "Davrni tanlab hisoblash" dialog preview so the UI
   * shows the exact [start, end] window the calculate run will settle, using
   * the company's configured cycleStartDay (never reinvented client-side).
   */
  async previewPeriod(companyId: number, asOfDate: Date) {
    return resolveCurrentPeriod(this.prisma, companyId, asOfDate);
  }

  /**
   * Net outstanding TEACHER_ADVANCE expenses out of a freshly-created salary
   * payment. Walks the advances in createdAt order and settles as many as
   * fit inside the available amount — remaining advances stay unsettled and
   * roll to the next cycle. Returns the total amount deducted so the caller
   * can update the SalaryPayment.amount accordingly.
   *
   * Must be called inside the same transaction that created the SalaryPayment
   * so settlement and the updated amount stay consistent.
   */
  private async applyPendingAdvances(
    tx: Prisma.TransactionClient,
    salaryPayment: { id: string; amount: number },
    userId: number,
    companyId: number,
  ): Promise<number> {
    const pending = await tx.expense.findMany({
      where: {
        category: 'TEACHER_ADVANCE',
        relatedUserId: userId,
        companyId,
        settledBySalaryPaymentId: null,
        deletedAt: null,
      },
      select: { id: true, amount: true },
      orderBy: { createdAt: 'asc' },
    });
    if (pending.length === 0) return 0;

    const toSettle: string[] = [];
    let deducted = 0;
    for (const exp of pending) {
      if (deducted + exp.amount > salaryPayment.amount) break;
      toSettle.push(exp.id);
      deducted += exp.amount;
    }
    if (toSettle.length === 0) return 0;

    await tx.expense.updateMany({
      where: { id: { in: toSettle } },
      data: { settledBySalaryPaymentId: salaryPayment.id },
    });
    await tx.salaryPayment.update({
      where: { id: salaryPayment.id },
      data: { amount: salaryPayment.amount - deducted },
    });

    return deducted;
  }

  /**
   * Center top-up (Faza 2). For every billable lesson in the period with NO live
   * accrual for the resolved teacher (a debtor's uncovered lesson), write a
   * center-funded `SalaryAccrual` so the teacher is paid their FULL deserved
   * salary. These are ordinary unlinked accruals, so the accrual sweep + payment
   * loop pick them up like student-covered ones.
   *
   * Idempotent: lessons that already carry a live accrual (covered OR a prior
   * top-up) are skipped by the sweep, and `createAccrual`'s upsert dedups on a
   * re-run. Teachers whose payment for THIS period is already APPROVED/PAID are
   * skipped so we never leave dangling unlinked accruals in a closed window.
   *
   * Runs in per-teacher, chunked Serializable transactions so the cron never
   * opens one giant long-running tx. Cost: one `createAccrual` per gap lesson
   * (rate lookup + balance mirror) — acceptable for a monthly 02:00 batch.
   */
  private async writeCenterTopUpAccruals(
    companyId: number,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    const gapByUser = await this.computeGapAccruals(
      companyId,
      periodStart,
      periodEnd,
    );
    if (gapByUser.size === 0) return;

    const closedPayments = await this.prisma.salaryPayment.findMany({
      where: {
        companyId,
        periodStart,
        periodEnd,
        status: {
          in: [SalaryPaymentStatus.APPROVED, SalaryPaymentStatus.PAID],
        },
      },
      select: { userId: true },
    });
    const closedSet = new Set(closedPayments.map((p) => p.userId));

    const CHUNK = 200;
    let written = 0;
    for (const [teacherId, specs] of gapByUser) {
      if (closedSet.has(teacherId)) continue;
      for (let i = 0; i < specs.length; i += CHUNK) {
        const batch = specs.slice(i, i + CHUNK);
        await this.prisma.$transaction(
          async (tx) => {
            for (const g of batch) {
              await this.salaryAccrualService.createAccrual({
                teacherId,
                studentId: g.studentId,
                groupId: g.groupId,
                attendanceId: g.attendanceId,
                lessonDate: g.lessonDate,
                perLessonCost: g.perLessonCost,
                companyId,
                centerFunded: true,
                // BR-09b: a backfilled lesson is credited to the current open
                // period; an ordinary in-period gap leaves this undefined.
                creditPeriodDateOverride: g.creditPeriodDate,
                tx,
              });
            }
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 20000,
            timeout: 120000,
          },
        );
        written += batch.length;
      }
    }
    this.logger.log(
      `Center top-up: wrote/upserted ${written} gap accrual(s) across ${gapByUser.size} teacher(s) for period [${periodStart.toISOString()}..${periodEnd.toISOString()}].`,
    );
  }

  /**
   * Bulk in-memory gap sweep — one query per input, no per-lesson DB lookups.
   * Mirrors `SalaryMonthlyService.getMonthly`'s deserved/gap pass and the
   * forecast script; all three share `deserved-math` so they stay in lock-step.
   * Returns per-teacher gap specs (uncovered billable lessons with a resolvable,
   * non-FIXED_MONTHLY rate). Config-gap lessons (no active rate at `lessonDate`)
   * are skipped — a rate is never fabricated.
   */
  private async computeGapAccruals(
    companyId: number,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Map<number, GapSpec[]>> {
    const [
      accruals,
      attendances,
      groups,
      groupTeachers,
      overrides,
      versionRows,
      heldCounts,
    ] = await Promise.all([
        // ALL non-reversed accruals bucketed into this period (covered + any
        // prior top-up) → covered-key set so a lesson is never double-listed.
        this.prisma.salaryAccrual.findMany({
          where: {
            companyId,
            reversedAt: null,
            OR: [
              { creditPeriodDate: { gte: periodStart, lte: periodEnd } },
              {
                creditPeriodDate: null,
                lessonDate: { gte: periodStart, lte: periodEnd },
              },
            ],
          },
          select: { userId: true, attendanceId: true },
        }),
        // BR-06/08/11: ABSENT excluded from the top-up set — the center never
        // fronts a no-show lesson (student is still billed elsewhere).
        this.prisma.attendance.findMany({
          where: {
            companyId,
            status: { in: ['PRESENT', 'LATE'] },
            date: { gte: periodStart, lte: periodEnd },
          },
          select: { id: true, studentId: true, groupId: true, date: true },
        }),
        this.prisma.group.findMany({
          where: { companyId },
          select: {
            id: true,
            course: { select: { price: true, lessonPaymentCount: true } },
          },
        }),
        this.prisma.groupTeacher.findMany({
          select: { groupId: true, teacherId: true },
        }),
        this.prisma.lessonTeacherOverride.findMany({
          where: { deletedAt: null },
          select: { groupId: true, date: true, teacherIds: true },
        }),
        this.prisma.employeeSalaryConfigVersion.findMany({
          where: { companyId, config: { isActive: true } },
          select: {
            salaryType: true,
            value: true,
            effectiveFrom: true,
            effectiveTo: true,
            config: {
              select: { userId: true, groupId: true, salaryType: true },
            },
          },
        }),
        // BR-09: per-(student, group) count of ATTENDED (PRESENT/LATE) lessons
        // up to this period's end. A new student whose count is below the
        // threshold is not yet center-fronted (see the gate in the loop below).
        this.prisma.attendance.groupBy({
          by: ['studentId', 'groupId'],
          where: {
            companyId,
            status: { in: ['PRESENT', 'LATE'] },
            date: { lte: periodEnd },
          },
          _count: { _all: true },
        }),
      ]);

    // (studentId::groupId) -> attended-lesson count (BR-09 new-student gate).
    const heldByStudentGroup = new Map<string, number>();
    for (const h of heldCounts) {
      heldByStudentGroup.set(`${h.studentId}::${h.groupId}`, h._count._all);
    }

    const dateStr = (d: Date) => d.toISOString().slice(0, 10);

    const coveredKey = new Set<string>(); // `${attendanceId}::${userId}`
    for (const a of accruals) {
      if (a.attendanceId) coveredKey.add(`${a.attendanceId}::${a.userId}`);
    }

    const groupMap = new Map(groups.map((g) => [g.id, g]));

    const rosterMap = new Map<string, number[]>();
    for (const gt of groupTeachers) {
      const arr = rosterMap.get(gt.groupId) ?? [];
      arr.push(gt.teacherId);
      rosterMap.set(gt.groupId, arr);
    }
    const overrideMap = new Map<string, number[]>();
    for (const o of overrides) {
      overrideMap.set(`${o.groupId}::${dateStr(o.date)}`, o.teacherIds);
    }
    const resolveTeachers = (groupId: string, dStr: string): number[] =>
      overrideMap.get(`${groupId}::${dStr}`) ?? rosterMap.get(groupId) ?? [];

    const versByKey = new Map<string, RateVersion[]>();
    const fixedMonthlyTeachers = new Set<number>();
    for (const r of versionRows) {
      const key = `${r.config.userId}::${r.config.groupId ?? 'GLOBAL'}`;
      const arr = versByKey.get(key) ?? [];
      arr.push({
        salaryType: r.salaryType,
        value: r.value,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
      });
      versByKey.set(key, arr);
      if (
        r.config.salaryType === SalaryType.FIXED_MONTHLY &&
        r.config.groupId == null
      ) {
        fixedMonthlyTeachers.add(r.config.userId);
      }
    }
    const resolveRate = (
      tid: number,
      groupId: string,
      at: Date,
    ): RateVersion | null =>
      pickActiveVersion(versByKey.get(`${tid}::${groupId}`), at) ??
      pickActiveVersion(versByKey.get(`${tid}::GLOBAL`), at);

    const gapByUser = new Map<number, GapSpec[]>();
    for (const att of attendances) {
      const g = groupMap.get(att.groupId);
      if (!g) continue;
      // BR-09: withhold the center top-up for a new student until they have
      // attended >= threshold lessons in this group. A covered (paid) lesson is
      // never gated — it isn't in this uncovered gap set to begin with.
      const held = heldByStudentGroup.get(`${att.studentId}::${att.groupId}`) ?? 0;
      if (held < NEW_STUDENT_TOPUP_MIN_LESSONS) continue;
      const lpc = g.course.lessonPaymentCount || 12;
      const perLessonCost = Math.round(g.course.price / lpc);
      const dStr = dateStr(att.date);
      for (const tid of resolveTeachers(att.groupId, dStr)) {
        if (coveredKey.has(`${att.id}::${tid}`)) continue; // already has a live accrual
        if (fixedMonthlyTeachers.has(tid)) continue; // flat salary — no per-lesson gap
        const v = resolveRate(tid, att.groupId, att.date);
        if (!v) continue; // config gap — do NOT fabricate a rate
        if (perLessonAccrual(v, perLessonCost, lpc) <= 0) continue; // FIXED_MONTHLY / zero
        const arr = gapByUser.get(tid) ?? [];
        arr.push({
          studentId: att.studentId,
          groupId: att.groupId,
          attendanceId: att.id,
          lessonDate: att.date,
          perLessonCost,
        });
        gapByUser.set(tid, arr);
      }
    }

    // ─── BR-09b: retroactive unlock across period boundaries ─────────────────
    // A new student who has now crossed the threshold may have EARLIER lessons
    // that were withheld while below it and now sit in an already-closed period.
    // Those lessons have NO accrual at all (never covered, never topped up), so
    // a bounded "un-accrued top-up-era backlog" scan is cheap. Front each such
    // lesson credited to the CURRENT open period (creditPeriodDate = periodStart)
    // so THIS settlement pays it. Skipped for the very first top-up period (no
    // prior era period to backfill from). Idempotent: once fronted, the lesson
    // has an accrual and the NOT EXISTS filter excludes it next time.
    const eraStart = topUpEraStartDate();
    if (periodStart > eraStart) {
      const backlog = await this.prisma.$queryRaw<
        { id: string; studentId: number; groupId: string; date: Date }[]
      >`
        SELECT a.id, a."studentId", a."groupId", a.date
        FROM "Attendance" a
        WHERE a."companyId" = ${companyId}
          AND a.status::text IN ('PRESENT', 'LATE')
          AND a.date >= ${eraStart}
          AND a.date < ${periodStart}
          AND NOT EXISTS (
            SELECT 1 FROM "SalaryAccrual" sa
            WHERE sa."attendanceId" = a.id AND sa."reversedAt" IS NULL
          )
      `;
      for (const att of backlog) {
        // Only genuine new-student pairs that have NOW crossed the threshold.
        const held = heldByStudentGroup.get(`${att.studentId}::${att.groupId}`) ?? 0;
        if (held < NEW_STUDENT_TOPUP_MIN_LESSONS) continue;
        const g = groupMap.get(att.groupId);
        if (!g) continue;
        const lpc = g.course.lessonPaymentCount || 12;
        const perLessonCost = Math.round(g.course.price / lpc);
        const dStr = dateStr(att.date);
        for (const tid of resolveTeachers(att.groupId, dStr)) {
          if (fixedMonthlyTeachers.has(tid)) continue;
          const v = resolveRate(tid, att.groupId, att.date);
          if (!v) continue;
          if (perLessonAccrual(v, perLessonCost, lpc) <= 0) continue;
          const arr = gapByUser.get(tid) ?? [];
          arr.push({
            studentId: att.studentId,
            groupId: att.groupId,
            attendanceId: att.id,
            lessonDate: att.date,
            perLessonCost,
            creditPeriodDate: periodStart,
          });
          gapByUser.set(tid, arr);
        }
      }
    }

    return gapByUser;
  }
}
