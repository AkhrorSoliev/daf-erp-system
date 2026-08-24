import { Injectable, Logger } from '@nestjs/common';
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
 * Enough rows to detect ambiguity without reading an unbounded set. The
 * busiest shared number in production carries 4 accounts.
 */
const MAX_CANDIDATES = 10;

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
 *
 * That tiebreak is safe for LOGIN, where the caller proves which account is
 * theirs by knowing its password. It is not safe ACROSS COMPANIES: this is a
 * public endpoint with no tenant in its input (no subdomain is configured, and
 * the portal headers resolve roles, not companies), so an arbitrary winner
 * could hand one tenant's phone-holder a password in another tenant. Today
 * there is exactly one company and zero phones shared across companies, which
 * is precisely why the guard costs nothing to add now and would be an
 * expensive thing to discover later.
 */
@Injectable()
export class PortalPasswordResetService {
  private readonly logger = new Logger(PortalPasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entityHistory: EntityHistoryService,
  ) {}

  async resolveByPhone(
    phone: string,
    allowedRoleIds?: number[] | null,
  ): Promise<ResettableTarget | null> {
    // `findMany` rather than `findFirst` for one reason: the FIRST row is still
    // the answer (identical filter, identical ordering), but the rest are what
    // reveal a cross-company collision. One query, same winner.
    const candidates = await this.prisma.user.findMany({
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
      take: MAX_CANDIDATES,
    });
    const user = candidates[0];
    if (!user) return null;

    // Fail closed on a tenant collision. Returning null makes the caller emit
    // its usual "if this number exists, a code was sent" — the reset simply
    // does not happen, and the log says why. Guessing would be the alternative,
    // and a wrong guess writes a password into the wrong company's account.
    const companies = new Set(candidates.map((c) => c.companyId));
    if (companies.size > 1) {
      this.logger.error(
        `Parol tiklash to'xtatildi: ${phone} raqami ${companies.size} ta ` +
          'kompaniyada uchraydi — qaysi akkaunt ekani aniq emas.',
      );
      return null;
    }

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
