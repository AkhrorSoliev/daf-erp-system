import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCallerInBranch } from './branch-scope';
import { assertCallerMayTouchStudent } from './student-branch-scope';
import { assertCallerMayTouchGroup } from './group-branch-scope';
import { assertCallerMayTouchUser } from './user-branch-scope';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * The entity types a comment may hang off.
 *
 * `Comment.entityType` is a bare `String` in the schema and the DTO accepted
 * any string at all, so the polymorphism had no edge: whatever the client sent
 * became a valid comment thread, and nothing checked that the entity existed,
 * belonged to this company, or belonged to this caller's branch.
 *
 * Four types, measured rather than guessed. Production carries 748 comments:
 * Student 487, Lead 232, Group 29. `User` has none yet but four live screens
 * write it (the employee and teacher profile tabs), so leaving it out would
 * break a working feature the moment someone used it.
 *
 * A closed list is half the fix. An unknown type now fails the DTO instead of
 * quietly creating a thread nobody can scope.
 */
export const COMMENTABLE_ENTITY_TYPES = [
  'Student',
  'Group',
  'Lead',
  'User',
] as const;

export type CommentableEntityType = (typeof COMMENTABLE_ENTITY_TYPES)[number];

/**
 * May this caller read or write comments on this entity?
 *
 * A comment thread carries what staff say about a person — a student's
 * payment excuses, a lead's objections, an employee's performance. It is not
 * weaker than the record it hangs off, so it is gated exactly as that record
 * is, by delegating to that record's own guard rather than inventing a fifth
 * branch rule here.
 *
 * `Lead` is the one that is NOT a straight branch check, and deliberately.
 * `Lead.branchId` is nullable and null means "not yet assigned" — a lead
 * arrives from a public form before anyone knows which branch will teach them,
 * and `leadBranchWhere` already treats that null as a pool every branch works.
 * Refusing comments on an unassigned lead would make the first note anyone
 * writes about a new enquiry impossible. An ASSIGNED lead is confined normally.
 */
export async function assertCallerMayTouchCommentEntity(
  prisma: PrismaLike,
  userId: number | undefined,
  roles: string[],
  entityType: string,
  entityId: string | number,
  companyId: number,
): Promise<void> {
  switch (entityType as CommentableEntityType) {
    case 'Student': {
      const id = Number(entityId);
      if (!Number.isInteger(id)) {
        throw new BadRequestException("O'quvchi identifikatori noto'g'ri");
      }
      await assertCallerMayTouchStudent(prisma, userId, id, companyId);
      return;
    }
    case 'Group': {
      await assertCallerMayTouchGroup(
        prisma,
        userId as number,
        roles,
        String(entityId),
        "Bu guruh boshqa filialga tegishli — izohlarini ko'rish huquqingiz yo'q",
      );
      return;
    }
    case 'User': {
      const id = Number(entityId);
      if (!Number.isInteger(id)) {
        throw new BadRequestException("Xodim identifikatori noto'g'ri");
      }
      await assertCallerMayTouchUser(
        prisma,
        userId,
        id,
        "Bu xodim boshqa filialga tegishli — izohlarini ko'rish huquqingiz yo'q",
      );
      return;
    }
    case 'Lead': {
      // No `deletedAt: null` here. Deleting a lead means marking it LOST and
      // archiving it, and the archive page is a real screen someone reads —
      // filtering archived leads out would 404 the notes explaining why the
      // lead was lost, which is the one thing that page is for.
      const lead = await prisma.lead.findFirst({
        where: { id: String(entityId) },
        select: { branchId: true },
      });
      if (!lead) throw new NotFoundException('Lid topilmadi');
      // null = the shared unassigned pool. See the note above: this mirrors
      // `leadBranchWhere`, and diverging from it would hide a lead's notes
      // from the same people the board shows the lead to.
      if (lead.branchId == null) return;
      await assertCallerInBranch(
        prisma,
        userId,
        lead.branchId,
        "Bu lid boshqa filialga tegishli — izohlarini ko'rish huquqingiz yo'q",
      );
      return;
    }
    default:
      // Unreachable through the DTO, which validates against the list above.
      // Reached only by an internal caller passing a new type without adding
      // it here — and the right answer to "I do not know how to scope this"
      // is a refusal, not a shrug.
      throw new BadRequestException(
        `Izoh uchun qo'llab-quvvatlanmaydigan obyekt turi: ${entityType}`,
      );
  }
}
