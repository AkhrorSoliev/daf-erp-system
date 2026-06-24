import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../entity-history';

/** Student role id (see CLAUDE.md: roles 1–6, Student = 6). */
const STUDENT_ROLE_ID = 6;

export interface ResettableTarget {
  userId: number;
  studentId?: number;
  companyId: number | null;
}

/**
 * Channel-agnostic core for portal password resets. Resolves the student-portal
 * account behind a phone deterministically and applies a new password + audit.
 *
 * IMPORTANT: neither `User.login` nor `Student.phone` is unique, so a phone can
 * map to several accounts (siblings, a shared parent number). We pick the
 * resettable student-role user: role 6, status ACTIVE/INACTIVE, most recently
 * updated — the same account the student logs into on student.dafzentrum.uz.
 */
@Injectable()
export class PortalPasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entityHistory: EntityHistoryService,
  ) {}

  async resolveByPhone(phone: string): Promise<ResettableTarget | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        login: phone,
        deletedAt: null,
        status: { in: [UserStatus.ACTIVE, UserStatus.INACTIVE] },
        roles: { some: { role: { id: STUDENT_ROLE_ID } } },
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
