import type { PrismaService } from '../../prisma/prisma.service';
import type { StatementView } from '../../statements/present-statement';

export type StatementStudent = {
  id: number;
  firstName: string;
  lastName: string;
  companyId: number | null;
};

const select = {
  id: true,
  firstName: true,
  lastName: true,
  companyId: true,
} as const;

/** Every student this chat is linked to (a parent's chat can hold several). */
export function studentsForChat(
  prisma: PrismaService,
  chatId: string,
): Promise<StatementStudent[]> {
  return prisma.student.findMany({
    where: { telegramChatId: chatId, deletedAt: null },
    select,
    orderBy: { id: 'asc' },
  });
}

/** One student, only while it is still linked to this chat. */
export async function studentOfChat(
  prisma: PrismaService,
  chatId: string,
  studentId: number,
): Promise<StatementStudent | null> {
  const [student] = await prisma.student.findMany({
    where: { id: studentId, telegramChatId: chatId, deletedAt: null },
    select,
  });
  return student ?? null;
}

/** Students whose phone is this 9-digit number (siblings can share one). */
export function studentsForPhone(
  prisma: PrismaService,
  phone: string,
): Promise<StatementStudent[]> {
  return prisma.student.findMany({
    where: { phone, deletedAt: null },
    select,
    orderBy: { id: 'asc' },
  });
}

export async function linkChat(
  prisma: PrismaService,
  studentIds: number[],
  chatId: string,
): Promise<void> {
  await prisma.student.updateMany({
    where: { id: { in: studentIds } },
    data: { telegramChatId: chatId },
  });
}

/** The statement's answer box as a chat message. */
export function statementMessage(answer: StatementView['answer']): string {
  return `💳 ${answer.title}\n${answer.subtitle}`;
}
