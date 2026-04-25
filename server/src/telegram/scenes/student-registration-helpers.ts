import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';

export const TEACHER_ROLE_ID = 4;

export const daysMap: Record<string, string> = {
  odd: 'Toq kunlar',
  even: 'Juft kunlar',
};

export const weekdayLabels: Record<string, string> = {
  monday: 'Du',
  tuesday: 'Se',
  wednesday: 'Cho',
  thursday: 'Pa',
  friday: 'Ju',
  saturday: 'Sha',
};

export async function loadTeachersForBranch(
  prisma: PrismaService,
  branchId: number,
) {
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      roles: { some: { roleId: TEACHER_ROLE_ID } },
      branches: { some: { branchId } },
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { firstName: 'asc' },
  });
}

export function buildTeachersKeyboard(
  teachers: { id: number; firstName: string; lastName: string }[],
) {
  return teachers.map((t) => [
    Markup.button.callback(
      `${t.firstName} ${t.lastName}`,
      `select_teacher_${t.id}`,
    ),
  ]);
}

interface QrGroupInfo {
  groupName?: string;
  teacherName?: string;
  days?: string;
  exactDays?: string[];
  lessonStartTime?: string;
  lessonEndTime?: string;
  roomName?: string;
}

export function formatQrGroupInfo(d: QrGroupInfo): string {
  const days = d.days
    ? (daysMap[d.days] ?? '')
    : d.exactDays?.length
      ? d.exactDays.map((day) => weekdayLabels[day] ?? day).join(', ')
      : '';
  const time =
    d.lessonStartTime && d.lessonEndTime
      ? `${d.lessonStartTime} – ${d.lessonEndTime}`
      : '';

  let info = `📚  ${d.groupName}\n`;
  info += `👨‍🏫  ${d.teacherName}\n`;
  if (days || time) info += `🕐  ${[days, time].filter(Boolean).join(' | ')}\n`;
  if (d.roomName) info += `🏫  ${d.roomName}\n`;
  return info;
}
