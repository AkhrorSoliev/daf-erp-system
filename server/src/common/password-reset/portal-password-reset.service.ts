import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../entity-history';

export interface ResettableTarget {
  userId: number;
  studentId?: number;
  companyId: number | null;
}

/**
 * Channel-agnostic core for portal password resets. Resolves the account behind
 * a phone deterministically and applies a new password + audit.
 *
 * Works for EVERY role now (login is phone-based across portals), not just
 * students. `allowedRoleIds` scopes the lookup to the calling portal's roles
 * (admin.* → staff, lehrer.* → teacher, student.* → student) so a phone shared
 * across accounts resets the right one. `null`/undefined = no role restriction
 * (localhost/dev).
 *
 * IMPORTANT: neither `User.login`/`phone` is unique, so a phone can map to
 * several accounts (siblings, a shared number, or one person with multiple
 * roles). Within the allowed roles we pick the status ACTIVE/INACTIVE account
 * that was most recently updated — the same tiebreak `validateUser` uses.
 */
@Injectable()
export class PortalPasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entityHistory: EntityHistoryService,
  ) {}

  async resolveByPhone(
    phone: string,
    allowedRoleIds?: number[] | null,
  ): Promise<ResettableTarget | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        // Staff carry the phone in `phone`; students in `login` (=phone).
        OR: [{ login: phone }, { phone }],
        deletedAt: null,
        status: { in: [UserStatus.ACTIVE, UserStatus.INACTIVE] },
        ...(allowedRoleIds && allowedRoleIds.length
          ? { roles: { some: { role: { id: { in: allowedRoleIds } } } } }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, companyId: true },
    });
    if (!user) return null;

    const student = await this.prisma.student.findFirst({
      where: { userId: user.id, deletedAt: null },
      select: { id: true, companyId: true },
    });

    return {
      userId: user.id,
      studentId: student?.id,
      companyId: student?.companyId ?? user.companyId ?? null,
    };
  }

  /**
   * Hash and set a new password on the user, then record a Student audit entry.
   * `channelLabel` describes the reset source, e.g. "SMS orqali tiklandi".
   */
  async applyNewPassword(
    target: ResettableTarget,
    plainPassword: string,
    channelLabel: string,
  ): Promise<void> {
    const hashed = await bcrypt.hash(plainPassword, 10);
    await this.prisma.user.update({
      where: { id: target.userId },
      data: { password: hashed },
    });

    if (target.studentId) {
      await this.entityHistory.recordUpdate({
        entityType: 'Student',
        entityId: target.studentId,
        oldValues: { parol: '***' },
        newValues: { parol: channelLabel },
        changedById: target.userId,
        companyId: target.companyId ?? undefined,
      });
    }
  }
}
