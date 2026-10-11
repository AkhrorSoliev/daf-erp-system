import type { PrismaService } from '../prisma/prisma.service';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { OPEN_STATUSES } from './task-transitions';

export interface TaskReportFigures {
  open: number;
  overdue: number;
  /** The assignee with the most overdue tasks; null when none or gone. */
  leader: { name: string; overdue: number } | null;
}

/**
 * The 21:00 report's task line (spec §4 screen 5), in the report's branch
 * scope. Read only. System tasks count too, like «Yuklama».
 */
export async function loadTaskReportFigures(
  db: Pick<PrismaService, 'task' | 'taskParticipant' | 'user'>,
  companyId: number,
  branchIds: ReportBranchIds,
  now = new Date(),
): Promise<TaskReportFigures> {
  const open = {
    companyId,
    status: { in: [...OPEN_STATUSES] },
    ...branchIdWhere(branchIds),
  };
  const late = { ...open, dueAt: { lt: now } };
  const [openCount, overdue, top] = await Promise.all([
    db.task.count({ where: open }),
    db.task.count({ where: late }),
    db.taskParticipant.groupBy({
      by: ['userId'],
      // A departed assignee (deleted or inactive) is never named; ties go to the lower id.
      where: {
        role: 'ASSIGNEE',
        task: late,
        user: { deletedAt: null, isActive: true, status: 'ACTIVE' },
      },
      _count: { userId: true },
      orderBy: [{ _count: { userId: 'desc' } }, { userId: 'asc' }],
      take: 1,
    }),
  ]);
  const first = top[0];
  const u = first
    ? await db.user.findUnique({
        where: { id: first.userId },
        select: { firstName: true, lastName: true },
      })
    : null;
  return {
    open: openCount,
    overdue,
    leader:
      first && u
        ? {
            name: `${u.firstName} ${u.lastName}`.trim(),
            overdue: first._count.userId,
          }
        : null,
  };
}
