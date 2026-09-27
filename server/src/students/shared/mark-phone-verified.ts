import { PrismaService } from '../../prisma/prisma.service';

/**
 * Records that the student proved `phone` by SMS (ADR-0039).
 *
 * The write is conditional on the card still carrying that number: a proof
 * for some other number (an SMS reset sent to an old sign-in number that no
 * longer matches the card) must not overwrite a proof of the current one.
 * Returns whether the card was marked.
 *
 * Two callers: the portal's own verification step, and the SMS password reset
 * — a student who reset by SMS has already proved the number, so they are
 * never asked twice.
 */
export async function markPhoneVerified(
  prisma: Pick<PrismaService, 'student'>,
  studentId: number,
  phone: string,
  at: Date = new Date(),
): Promise<boolean> {
  const { count } = await prisma.student.updateMany({
    where: { id: studentId, phone, deletedAt: null },
    data: { verifiedPhone: phone, phoneVerifiedAt: at },
  });
  return count > 0;
}
