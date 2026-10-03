import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { STUDENT_ROLE_ID } from './student-select';

export type ExtraPhoneHolder =
  | { kind: 'own-main' }
  | { kind: 'card'; studentId: number; name: string }
  | { kind: 'account'; userId: number };

export type ExtraPhoneSelf = {
  /** The card being written, or null for a card not created yet. */
  studentId: number | null;
  /** Its sign-in account, or null. */
  userId: number | null;
  /** The main number the card will carry after this write. */
  phone: string;
};

// `Pick`, not `PrismaService`: a transaction client has the same two models.
export type ExtraPhoneDb = Pick<PrismaService, 'student' | 'user'>;

export const EXTRA_PHONE_IS_MAIN_MESSAGE =
  "Zaxira raqam asosiy raqam bilan bir xil bo'lmasin";
export const EXTRA_PHONE_TAKEN_STUDENT_MESSAGE = "Bu raqamni qo'shib bo'lmaydi";
export const EXTRA_PHONE_TAKEN_ACCOUNT_STAFF_MESSAGE =
  "Bu raqam boshqa o'quvchi hisobida bor";
export const extraPhoneTakenStaffMessage = (name: string) =>
  `Bu raqam boshqa o'quvchida bor: ${name}`;

/**
 * Another live student account that signs in with this number (by `phone` or
 * `login`), or null. Staff accounts do not count (ADR-0022: the same person
 * may be staff). `excludeUserId` is the account being written, null for none.
 * The one account-holder predicate: the backup-number rule and the first-run
 * number change both ask here.
 */
export function findStudentAccountOnNumber(
  db: ExtraPhoneDb,
  phone: string,
  excludeUserId: number | null,
): Promise<{ id: number } | null> {
  return db.user.findFirst({
    where: {
      OR: [{ phone }, { login: phone }],
      deletedAt: null,
      roles: { some: { roleId: STUDENT_ROLE_ID } },
      ...(excludeUserId !== null && { id: { not: excludeUserId } }),
    },
    select: { id: true },
  });
}

/**
 * Is a backup number (`Student.extraPhone`) free to take? ADR-0067: a backup
 * number is a sign-in key, and one number signs exactly one student in — so
 * it may not be this card's own main number, another live card's main or
 * backup number, or another live student account's sign-in number. Every
 * writer of `extraPhone` asks here and nowhere else.
 */
export async function findExtraPhoneHolder(
  db: ExtraPhoneDb,
  phone: string,
  self: ExtraPhoneSelf,
): Promise<ExtraPhoneHolder | null> {
  if (phone === self.phone) return { kind: 'own-main' };

  const card = await db.student.findFirst({
    where: {
      deletedAt: null,
      OR: [{ phone }, { extraPhone: phone }],
      ...(self.studentId !== null && { id: { not: self.studentId } }),
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (card) {
    return {
      kind: 'card',
      studentId: card.id,
      name: `${card.firstName} ${card.lastName}`.trim(),
    };
  }

  const account = await findStudentAccountOnNumber(db, phone, self.userId);
  return account ? { kind: 'account', userId: account.id } : null;
}

/** Throws 400 when the number is not free; the text depends on who asked. */
export async function assertExtraPhoneFree(
  db: ExtraPhoneDb,
  phone: string,
  self: ExtraPhoneSelf,
  audience: 'staff' | 'student',
): Promise<void> {
  const holder = await findExtraPhoneHolder(db, phone, self);
  if (!holder) return;
  if (holder.kind === 'own-main') {
    throw new BadRequestException(EXTRA_PHONE_IS_MAIN_MESSAGE);
  }
  if (audience === 'student') {
    throw new BadRequestException(EXTRA_PHONE_TAKEN_STUDENT_MESSAGE);
  }
  throw new BadRequestException(
    holder.kind === 'card'
      ? extraPhoneTakenStaffMessage(holder.name)
      : EXTRA_PHONE_TAKEN_ACCOUNT_STAFF_MESSAGE,
  );
}
