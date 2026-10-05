import type { PrismaService } from '../../prisma/prisma.service';
import {
  presentStatement,
  type StatementView,
} from '../../statements/present-statement';
import {
  statementFilename,
  type StatementService,
} from '../../statements/statement.service';

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
  // The chat is writing to the bot right now, so it takes messages: a mark
  // left by an old chat (a deleted Telegram account) goes too (ADR-0066).
  await prisma.student.updateMany({
    where: { id: { in: studentIds } },
    data: { telegramChatId: chatId, telegramDisconnectedAt: null },
  });
}

/**
 * The statement's answer box as a chat message, under the student's name and
 * ID. The ID is the account Payme and Click take, and a parent's chat can hold
 * several students, so the message says whose statement it is.
 */
export function statementMessage(
  answer: StatementView['answer'],
  student: { id: number; name: string },
): string {
  return `${student.name} · ID ${student.id}\n💳 ${answer.title}\n${answer.subtitle}`;
}

/**
 * What the bot sends for a statement: the answer box as a message, then the
 * whole statement as a PDF. «💳 To'lovlar» and the Mini App's button both send
 * exactly this.
 */
export async function statementForChat(
  statements: Pick<StatementService, 'pdf'>,
  studentId: number,
  companyId: number,
  present: typeof presentStatement = presentStatement,
): Promise<{ text: string; document: { source: Buffer; filename: string } }> {
  const { buffer, model } = await statements.pdf(studentId, companyId);
  return {
    text: statementMessage(present(model, 'student').answer, model.student),
    document: { source: buffer, filename: statementFilename(model) },
  };
}
