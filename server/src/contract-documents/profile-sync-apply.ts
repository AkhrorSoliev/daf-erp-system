import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { EntityHistoryService } from '../common/entity-history';
import type { ContractCustomer } from './contract-fields';
import {
  conflictMessage,
  profileSyncPlan,
  type ProfileField,
  type StudentProfile,
} from './profile-sync';

export const PROFILE_SELECT = {
  passportSeries: true,
  address: true,
  telegram: true,
  parentName: true,
  parentPhone: true,
  phone: true,
} as const satisfies Prisma.StudentSelect;

/**
 * Writes what the contract adds to the student's profile, inside the
 * contract's transaction; an unsettled difference refuses the whole save.
 */
export async function syncStudentProfile(
  tx: Prisma.TransactionClient,
  history: EntityHistoryService,
  args: {
    studentId: number;
    profile: StudentProfile;
    customer: ContractCustomer;
    updates: readonly string[] | undefined;
    companyId: number;
    userId: number;
  },
): Promise<void> {
  const plan = profileSyncPlan(args.customer, args.profile, args.updates);
  if (plan.conflicts.length > 0) {
    throw new BadRequestException(conflictMessage(plan.conflicts));
  }
  const keys = Object.keys(plan.writes) as ProfileField[];
  if (keys.length === 0) return;
  await tx.student.updateMany({
    where: { id: args.studentId },
    data: plan.writes,
  });
  await history.recordUpdate({
    entityType: 'Student',
    entityId: args.studentId,
    oldValues: Object.fromEntries(keys.map((k) => [k, args.profile[k]])),
    newValues: plan.writes,
    changedById: args.userId,
    companyId: args.companyId,
    tx,
  });
}
