import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { PrismaService } from '../../prisma/prisma.service';

export const WRONG_CURRENT_PASSWORD_MESSAGE = "Joriy parol noto'g'ri";

/**
 * The caller's own password, checked before a sign-in key of theirs changes
 * (ADR-0031). The route that calls this carries `OwnPasswordAttemptGuard`.
 */
export async function assertCurrentPassword(
  prisma: Pick<PrismaService, 'user'>,
  userId: number,
  currentPassword: string,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { password: true },
  });
  const ok =
    !!user?.password && (await bcrypt.compare(currentPassword, user.password));
  if (!ok) throw new BadRequestException(WRONG_CURRENT_PASSWORD_MESSAGE);
}
