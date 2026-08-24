import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MockExamStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

/**
 * Auto-closes mock exam registrations whose `registrationDeadline` has
 * passed. Runs once daily at 03:00 Tashkent — this flip is purely cosmetic
 * (the admin "Ro'yxat yopiq" badge) + an audit row. It is NOT the real
 * enforcement gate: the Telegram registration scene rejects late sign-ups
 * with its own live `registrationDeadline < now` check on every scene entry
 * (see telegram/scenes/mock-exam-registration.scene.ts), so a student can
 * never register after the deadline regardless of how stale this status is.
 * A frequent poll therefore bought nothing but DB wake-ups; daily is enough.
 * (Admin manual-add via `addManual` is intentionally allowed post-deadline —
 * an admin can still register a walk-in — so this cron never gated that path.)
 *
 * Only `REGISTRATION_OPEN` exams are considered; any exam already in a
 * later lifecycle stage (`REGISTRATION_CLOSED` / `GRADING` / ...) is
 * skipped. The `lte` filter makes the tick idempotent, so a missed day or a
 * restart-skipped run self-heals on the next tick. Each transition writes an
 * `EntityHistory` row so the audit log shows the system as the actor.
 */
@Injectable()
export class MockExamDeadlineCronService {
  private readonly logger = new Logger(MockExamDeadlineCronService.name);

  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  @Cron('0 0 3 * * *', { timeZone: 'Asia/Tashkent' })
  async tick() {
    const now = new Date();
    const due = await this.prisma.mockExam.findMany({
      where: {
        status: MockExamStatus.REGISTRATION_OPEN,
        deletedAt: null,
        registrationDeadline: { not: null, lte: now },
      },
      // `companyId` is selected because the audit row needs it. An earlier
      // version hardcoded 1001 on the belief that "MockExam is single-tenant
      // (no companyId column — same as Lead)". Both halves are wrong: the
      // model has carried `companyId` and an index on it for some time, and so
      // has Lead. A hardcoded tenant in a cron is the kind of thing that is
      // right until the day a second company exists and then files every
      // audit row under the wrong one.
      select: { id: true, title: true, companyId: true },
    });

    if (due.length === 0) return;

    this.logger.log(
      `Auto-closing ${due.length} mock exam(s) whose deadline passed`,
    );

    for (const exam of due) {
      try {
        await this.prisma.mockExam.update({
          where: { id: exam.id },
          data: { status: MockExamStatus.REGISTRATION_CLOSED },
        });

        await this.entityHistoryService.recordStatusChange({
          entityType: 'MockExam',
          entityId: exam.id,
          oldValues: { status: MockExamStatus.REGISTRATION_OPEN },
          newValues: {
            status: MockExamStatus.REGISTRATION_CLOSED,
            reason: 'AUTO_DEADLINE',
          },
          // System actor — no human user is behind this transition.
          changedById: null as unknown as number,
          companyId: exam.companyId,
        });
      } catch (err) {
        this.logger.error(
          `Failed to auto-close exam ${exam.id}: ${(err as Error).message}`,
        );
      }
    }
  }
}
