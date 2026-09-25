import { Prisma, UserStatus } from '@prisma/client';

/**
 * What archiving (soft-deleting) a `User` writes to the row.
 *
 * Two doors archive a user — `UsersService.softDelete` (the employee page,
 * `DELETE /users/:id`) and `TeachersService.delete` (`DELETE /teachers/:id`) —
 * and they must leave the row in the same state. While each spelled the fields
 * out on its own they drifted: the employee door wrote only `deletedAt`, so an
 * archived employee stayed `status: ACTIVE, isActive: true` for every reader
 * that filters on status instead of `deletedAt`.
 *
 * The rule is server/CLAUDE.md, "User Status & isActive Synchronization": an
 * archived user is `ARCHIVED` and inactive, and the archive is recorded as the
 * latest status change. `ArchiveRestoreService.restore` undoes every field.
 *
 * Import it by path, not through the `common/status` barrel: the barrel loads
 * modules that import `UsersService`, so using it there creates an import cycle.
 */
export function userArchiveData(deletedById: number) {
  const archivedAt = new Date();
  return {
    status: UserStatus.ARCHIVED,
    isActive: false,
    deletedAt: archivedAt,
    deletedById,
    statusChangedAt: archivedAt,
    statusChangedById: deletedById,
    statusChangeReason: "O'chirildi",
  } satisfies Prisma.UserUncheckedUpdateInput;
}
