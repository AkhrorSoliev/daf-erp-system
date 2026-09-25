import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { STUDENT_ROLE_ID } from '../../students/shared/student-select';
import { generatePassword } from '../utils/password.util';
import { loginForPhone } from './phone-account-rules';

/**
 * A student's sign-in account: an account whose ONLY role is Student.
 *
 * It belongs to its card (`Student.userId`) and lives only while the card is
 * live (ADR-0033): archiving the card closes it, restoring the card reopens
 * it. An account that also holds a staff role is a staff account first —
 * closing it with a card would lock a member of staff out — so it never
 * matches. ADR-0022 keeps the two apart; production had none on 2026-09-24.
 */
export const STUDENT_ONLY_ACCOUNT = {
  AND: [
    { roles: { some: { roleId: STUDENT_ROLE_ID } } },
    { roles: { every: { roleId: STUDENT_ROLE_ID } } },
  ],
} satisfies Prisma.UserWhereInput;

/** In-memory twin of {@link STUDENT_ONLY_ACCOUNT}. A role-less account is not a student. */
export function isStudentOnlyAccount(roleIds: readonly number[]): boolean {
  return roleIds.length > 0 && roleIds.every((id) => id === STUDENT_ROLE_ID);
}

export type SignInAccountState = 'Ochiq' | 'Yopildi' | "Yo'q";

/**
 * The card-history pair recording the account opening or closing. The history
 * tab labels `kirishHisobi` "Kirish hisobi"; the card is where staff look, the
 * account has no history tab of its own.
 */
export function signInAccountChange(
  from: SignInAccountState,
  to: SignInAccountState,
) {
  return {
    oldValues: { kirishHisobi: from },
    newValues: { kirishHisobi: to },
  };
}

/**
 * Opens a card's sign-in account and links it: the login is the phone unless
 * another live account already holds it (ADR-0022), the password is random,
 * the only role is Student. The plain password goes back to the one caller
 * that shows it (the admin create form); the repair script never prints it.
 */
export async function openStudentAccount(
  db: PrismaService | Prisma.TransactionClient,
  card: {
    id: number;
    phone: string;
    firstName: string;
    lastName: string;
    companyId: number;
  },
): Promise<{ userId: number; login: string | null; plainPassword: string }> {
  const login = await loginForPhone(db, card.phone);
  const plainPassword = generatePassword();
  const password = await bcrypt.hash(plainPassword, 10);

  const user = await db.user.create({
    data: {
      login,
      password,
      firstName: card.firstName,
      lastName: card.lastName,
      phone: card.phone,
      companyId: card.companyId,
      roles: { create: [{ roleId: STUDENT_ROLE_ID }] },
    },
    select: { id: true },
  });

  await db.student.update({
    where: { id: card.id },
    data: { userId: user.id },
  });

  return { userId: user.id, login, plainPassword };
}
