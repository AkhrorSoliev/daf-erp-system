import { BadRequestException } from '@nestjs/common';
import { STUDENT_ROLE_ID } from './student-select';

/**
 * Is a backup number (`Student.extraPhone`) free to take? ADR-0067: a backup
 * number is a sign-in key, and one number signs exactly one student in — so
 * it may not be this card's own main number, another live card's main or
 * backup number, or another live student account's sign-in number. Staff
 * accounts do not count (ADR-0022: the same person may be staff). Every
 * writer of `extraPhone` asks here and nowhere else.
 */
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

type Db = {
  student: {
    findFirst: (args: any) => Promise<any>;
  };
  user: {
    findFirst: (args: any) => Promise<any>;
  };
};

export const EXTRA_PHONE_IS_MAIN_MESSAGE =
  "Zaxira raqam asosiy raqam bilan bir xil bo'lmasin";
export const EXTRA_PHONE_TAKEN_STUDENT_MESSAGE = "Bu raqamni qo'shib bo'lmaydi";
export const EXTRA_PHONE_TAKEN_ACCOUNT_STAFF_MESSAGE =
  "Bu raqam boshqa o'quvchi hisobida bor";
export const extraPhoneTakenStaffMessage = (name: string) =>
  `Bu raqam boshqa o'quvchida bor: ${name}`.trim();

export async function findExtraPhoneHolder(
  db: Db,
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

  const account = await db.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ phone }, { login: phone }],
      roles: { some: { roleId: STUDENT_ROLE_ID } },
      ...(self.userId !== null && { id: { not: self.userId } }),
    },
    select: { id: true },
  });
  return account ? { kind: 'account', userId: account.id } : null;
}

/** Throws 400 when the number is not free; the text depends on who asked. */
export async function assertExtraPhoneFree(
  db: Db,
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
