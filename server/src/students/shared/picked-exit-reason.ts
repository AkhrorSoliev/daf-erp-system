import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExitType } from '@prisma/client';
import {
  EXIT_REASON_COMMENT_ERROR,
  EXIT_REASON_COMMENT_MIN_LENGTH,
  exitReasonRequiresComment,
} from '../../common/exit-reason-comment';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * A reason picked from the company's exit-reason list, recorded the way a
 * student's status change records it: the row must be live, the company's own
 * and listed for this exit type; «Boshqa sabab» needs its comment; the text is
 * the reason's name with the comment after it.
 *
 * Both doors a status change goes through call it — `PATCH /students/:id/status`
 * and the archive (`DELETE /students/:id`), which the status dialog uses for
 * ARCHIVED — so a picked reason is recorded the same way through either.
 */
export async function resolvePickedExitReason(
  prisma: PrismaService,
  input: {
    reasonId: string;
    comment: string | null;
    exitType: ExitType;
    companyId: number;
  },
): Promise<{ id: string; text: string }> {
  const reason = await prisma.studentExitReason.findFirst({
    where: {
      id: input.reasonId,
      companyId: input.companyId,
      deletedAt: null,
      appliesTo: { has: input.exitType },
    },
  });
  if (!reason) {
    throw new NotFoundException(
      'Sabab topilmadi yoki bu holatga taalluqli emas',
    );
  }
  // "Boshqa sabab" carries no information on its own — the comment IS the
  // reason, so it becomes mandatory. Other reasons keep it optional.
  if (
    exitReasonRequiresComment(reason.name) &&
    (!input.comment || input.comment.length < EXIT_REASON_COMMENT_MIN_LENGTH)
  ) {
    throw new BadRequestException(EXIT_REASON_COMMENT_ERROR);
  }
  return {
    id: reason.id,
    text: input.comment ? `${reason.name} — ${input.comment}` : reason.name,
  };
}
