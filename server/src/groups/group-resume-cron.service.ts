import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tashkentDateStr } from '../common/date/tashkent';
import { GroupsStatusService } from './groups-status.service';

export const AUTO_RESUME_REASON = 'Rejalangan sanada qayta ochildi';

/**
 * Opens a paused group on the day its resume was scheduled for (ADR-0119,
 * §1b). Admin said "restart on 05.11" before that day: the group stays PAUSED
 * (its pause days still refund) and this job flips it that morning, through
 * the same `changeStatus` an admin uses, so the charge, the history and the
 * student messages follow one path. The company's CEO stands as the actor:
 * there is no admin at 00:10, and the CEO spans every branch.
 */
@Injectable()
export class GroupResumeCronService {
  private readonly logger = new Logger(GroupResumeCronService.name);

  constructor(
    private prisma: PrismaService,
    private groupsStatus: GroupsStatusService,
  ) {}

  // After GroupStatusCronService (00:05), which activates FORMING groups.
  @Cron('0 10 0 * * *', { timeZone: 'Asia/Tashkent' })
  async nightly() {
    try {
      await this.run();
    } catch (err) {
      this.logger.error(
        `Rejalangan ochish yurmadi: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async run(
    now: Date = new Date(),
  ): Promise<{ resumed: number; failed: number }> {
    const todayStr = tashkentDateStr(now);
    const due = await this.prisma.groupPause.findMany({
      where: {
        endedAt: null,
        resumeOn: { not: null, lte: new Date(`${todayStr}T00:00:00.000Z`) },
        group: { deletedAt: null, statusEnum: GroupStatus.PAUSED },
      },
      select: { groupId: true, companyId: true },
    });

    let resumed = 0;
    let failed = 0;
    for (const p of due) {
      try {
        const ceo = await this.prisma.user.findFirst({
          where: {
            companyId: p.companyId,
            deletedAt: null,
            roles: { some: { role: { name: 'CEO' } } },
          },
          select: { id: true },
          orderBy: { id: 'asc' },
        });
        if (!ceo) throw new Error('Kompaniyada CEO topilmadi');
        await this.groupsStatus.changeStatus(
          p.groupId,
          {
            status: GroupStatus.ACTIVE,
            resumeOn: todayStr,
            reason: AUTO_RESUME_REASON,
          },
          ceo.id,
          p.companyId,
        );
        resumed++;
      } catch (err) {
        failed++;
        this.logger.error(
          `Guruh ${p.groupId} rejalangan sanada ochilmadi: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { resumed, failed };
  }
}
