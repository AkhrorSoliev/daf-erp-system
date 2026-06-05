import { Prisma } from '@prisma/client';

/**
 * Canonical ordering for every single-group student roster.
 *
 * Each list of a group's enrolled students must render in the same positions on
 * every tab — O'quvchilar (`findStudentsByGroupId`), Darslar (`getLessonSequence`),
 * Davomat form (`getByDate`), Statistika (`getStats`) and Debtors
 * (`getDebtorsForGroup`). Order is alphabetical by first name, then last name,
 * then a stable student-id tiebreaker so students who share a name never drift
 * between queries.
 *
 * Shared on purpose: these `enrollment.findMany` queries live in different
 * modules (groups, attendance, payments) and previously diverged
 * (`findStudentsByGroupId` sorted by enrollment `createdAt desc` while the rest
 * sorted by `firstName`), which is exactly the inconsistency this constant
 * prevents. Reuse it for any new group-roster query.
 */
export const STUDENT_ROSTER_ORDER_BY: Prisma.EnrollmentOrderByWithRelationInput[] =
  [
    { student: { firstName: 'asc' } },
    { student: { lastName: 'asc' } },
    { student: { id: 'asc' } },
  ];
