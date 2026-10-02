import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MonthlyChargeService } from './monthly-charge.service';
import {
  STUDENT_SELF_ENROLLED,
  type StudentSelfEnrolledEvent,
} from '../common/events/self-enrollment.events';

/**
 * Charges the join month of a Telegram self-registration the moment it is
 * written. Without it the month waited for the 04:00 daily run, and a student
 * who signed up on a month's last lesson day after that run was never billed
 * for it — on 30.09.2026 five students attended September's last lesson free.
 */
@Injectable()
export class SelfEnrollmentChargeListener {
  private readonly logger = new Logger(SelfEnrollmentChargeListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly monthlyCharges: MonthlyChargeService,
  ) {}

  @OnEvent(STUDENT_SELF_ENROLLED)
  async onSelfEnrolled(event: StudentSelfEnrolledEvent): Promise<void> {
    try {
      await this.prisma.$transaction(
        (tx) => this.monthlyCharges.chargeJoinMonth(tx, event),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 15_000,
        },
      );
    } catch (err) {
      // The student is registered already; the next daily run charges the
      // month unless it has ended by then.
      this.logger.error(
        `Join-month charge failed for enrollment ${event.enrollmentId}`,
        err as Error,
      );
    }
  }
}
