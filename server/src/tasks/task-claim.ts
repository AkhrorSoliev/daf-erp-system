import type { Prisma } from '@prisma/client';

/** First assignee to act takes a system task; the other copies go (ADR-0054). */
export async function claimSystemTask(
  tx: Prisma.TransactionClient,
  taskId: string,
  userId: number,
): Promise<boolean> {
  const rows = await tx.taskParticipant.findMany({
    where: { taskId, role: 'ASSIGNEE' },
    select: { userId: true },
  });
  if (!rows.some((r) => r.userId === userId)) return false;
  // Lesson row first (lock order), same as before the move.
  await tx.unmarkedLesson.updateMany({
    where: { taskId },
    data: { claimedById: userId },
  });
  await tx.task.update({
    where: { id: taskId },
    data: { claimedById: userId },
  });
  if (rows.length > 1) {
    await tx.taskParticipant.deleteMany({
      where: { taskId, role: 'ASSIGNEE', userId: { not: userId } },
    });
  }
  return true;
}
