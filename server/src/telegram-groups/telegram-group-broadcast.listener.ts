import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentMethod, PaymentSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramGroupBroadcastService } from './telegram-group-broadcast.service';
import { TelegramGroupDigestBufferService } from './telegram-group-digest-buffer.service';
import { formatDate, formatDateTime, formatSum } from './utils/format.util';
import {
  INSTANT_PAYMENT_THRESHOLD_SUM,
  LARGE_PAYMENT_THRESHOLD_SUM,
} from './constants';

export interface StudentCreatedEvent {
  studentId: number;
  firstName: string;
  lastName: string;
  branchId?: number | null;
  branchName?: string | null;
  companyId: number;
}

export interface GroupCreatedEvent {
  groupId: string;
  name: string;
  branchId: number;
  branchName?: string | null;
  startDate?: Date | string | null;
  companyId: number;
}

interface PaymentReceivedEvent {
  paymentId: string;
  studentId: number;
  amount: number;
  method: PaymentMethod;
  source: PaymentSource;
  studentBalance: number | null;
  companyId: number;
  performedById?: number;
}

interface EntityStatusChangedEvent {
  entityType: string;
  entityId: string;
  oldStatus?: string;
  newStatus?: string;
  reason?: string;
  changedById?: number;
  companyId?: number;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Naqd',
  PAYME: 'Payme',
  CLICK: 'Click',
  UZUM: 'Uzum',
  TRANSFER: "O'tkazma",
};

const WEEKDAY_LABELS: Record<string, string> = {
  monday: 'Dushanba',
  tuesday: 'Seshanba',
  wednesday: 'Chorshanba',
  thursday: 'Payshanba',
  friday: 'Juma',
  saturday: 'Shanba',
  sunday: 'Yakshanba',
};

/** Escapes the 3 characters Telegram's HTML parse mode is sensitive to. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Subscribes to domain events and routes them to approved Telegram groups.
 *
 * Routing policy:
 *  - High-signal, low-frequency events (status changes, very large payments)
 *    are broadcast **instantly**.
 *  - High-frequency, low-signal events (new student, new payment, new group)
 *    are **buffered** and flushed every 3 hours as one digest message by
 *    `TelegramGroupDigestCronService`. This stops the group being flooded
 *    with a separate message per student/payment.
 *
 * All handlers are best-effort — failures never throw back into the
 * originating transaction.
 */
@Injectable()
export class TelegramGroupBroadcastListener {
  private readonly logger = new Logger(TelegramGroupBroadcastListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcast: TelegramGroupBroadcastService,
    private readonly digestBuffer: TelegramGroupDigestBufferService,
  ) {}

  @OnEvent('student.created')
  async onStudentCreated(payload: StudentCreatedEvent) {
    try {
      // Buffered — folded into the next 3-hourly digest.
      await this.digestBuffer.push(payload.companyId, {
        kind: 'student',
        branchId: payload.branchId ?? null,
        studentId: payload.studentId,
        name: `${payload.firstName} ${payload.lastName}`,
        branchName: payload.branchName ?? null,
      });
    } catch (err: any) {
      this.logger.warn(`student.created buffering failed: ${err?.message}`);
    }
  }

  @OnEvent('group.created')
  async onGroupCreated(payload: GroupCreatedEvent) {
    try {
      // Buffered — folded into the next 3-hourly digest.
      await this.digestBuffer.push(payload.companyId, {
        kind: 'group',
        branchId: payload.branchId,
        name: payload.name,
        branchName: payload.branchName ?? null,
        startDate: payload.startDate
          ? new Date(payload.startDate).toISOString()
          : null,
      });
    } catch (err: any) {
      this.logger.warn(`group.created buffering failed: ${err?.message}`);
    }
  }

  @OnEvent('payment.received')
  async onPaymentReceived(payload: PaymentReceivedEvent) {
    try {
      const isLarge = payload.amount >= LARGE_PAYMENT_THRESHOLD_SUM;
      const isExternal =
        payload.method === PaymentMethod.PAYME ||
        payload.method === PaymentMethod.CLICK ||
        payload.method === PaymentMethod.UZUM;
      if (!isLarge && !isExternal) {
        return; // small cash/transfer payments — daily report covers them
      }

      // Resolve student name + branch for the message / digest entry.
      const student = await this.prisma.student.findUnique({
        where: { id: payload.studentId },
        select: {
          firstName: true,
          lastName: true,
          branches: {
            take: 1,
            select: { branch: { select: { id: true, name: true } } },
          },
        },
      });

      const studentName = student
        ? `${student.firstName} ${student.lastName}`
        : `O'quvchi ID ${payload.studentId}`;
      const branchId = student?.branches[0]?.branch?.id ?? null;
      const methodLabel = METHOD_LABELS[payload.method] ?? payload.method;

      // Very large payments are notable — send instantly. No throttle bucket,
      // so two big payments close together both reach the group.
      if (payload.amount >= INSTANT_PAYMENT_THRESHOLD_SUM) {
        await this.broadcast.broadcast({
          companyId: payload.companyId,
          branchId,
          message:
            `💳 <b>Yangi to'lov</b>\n\n` +
            `${studentName}\n` +
            `Summa: <b>${formatSum(payload.amount)}</b>\n` +
            `Usul: ${methodLabel}`,
        });
        return;
      }

      // Ordinary large / external payments — buffered into the digest.
      await this.digestBuffer.push(payload.companyId, {
        kind: 'payment',
        branchId,
        studentName,
        amount: payload.amount,
        method: payload.method,
      });
    } catch (err: any) {
      this.logger.warn(`payment.received broadcast failed: ${err?.message}`);
    }
  }

  @OnEvent('entity.status.changed')
  async onEntityStatusChanged(payload: EntityStatusChangedEvent) {
    try {
      if (!payload.companyId) return;

      // Group transitions carry only a UUID on the event, so we enrich the
      // message with the group's real details (name, level, teacher, schedule,
      // room) via a lookup. Branch-scoped groups are addressed by branchId.
      if (payload.entityType === 'Group') {
        await this.broadcastGroupStatusChange(payload);
        return;
      }

      // Student transitions carry only the id on the event, so — like group
      // transitions — we enrich the message with the student's real details
      // (name, branch, active groups + their teachers, who made the change).
      const built = await this.buildStudentStatusMessage(payload);
      if (!built) return; // not a status transition we broadcast
      // Status changes stay instant. The throttle bucket includes the entity
      // id so two different entities changing within 30s don't collide — only
      // a genuine duplicate of the same entity is deduped.
      await this.broadcast.broadcast({
        companyId: payload.companyId,
        branchId: built.branchId,
        message: built.message,
        eventClass: `entity.status.changed:${payload.entityType}:${payload.entityId}`,
      });
    } catch (err: any) {
      this.logger.warn(
        `entity.status.changed broadcast failed: ${err?.message}`,
      );
    }
  }

  /**
   * Builds and sends the enriched message for a group starting or finishing.
   * Falls back to a minimal ID-only message if the group row can't be loaded
   * (e.g. the emitting transaction rolled back after the event fired).
   */
  private async broadcastGroupStatusChange(p: EntityStatusChangedEvent) {
    const from = p.oldStatus;
    const to = p.newStatus;
    if (!from || !to || from === to) return;

    let header: string | null = null;
    let dateLabel = '';
    if (from === 'FORMING' && to === 'ACTIVE') {
      header = '🚀 <b>Yangi guruh boshlandi</b>';
      dateLabel = 'Boshlandi';
    } else if (from === 'ACTIVE' && to === 'COMPLETED') {
      header = '🏁 <b>Guruh tugadi</b>';
      dateLabel = 'Tugadi';
    }
    if (!header) return; // not a transition we broadcast

    const eventClass = `entity.status.changed:Group:${p.entityId}`;
    const group = await this.prisma.group.findUnique({
      where: { id: p.entityId },
      select: {
        name: true,
        level: true,
        branchId: true,
        lessonStartTime: true,
        lessonEndTime: true,
        exactDays: true,
        startDate: true,
        endDate: true,
        course: { select: { name: true } },
        branch: { select: { name: true } },
        room: { select: { name: true } },
        teachers: {
          select: {
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!group) {
      await this.broadcast.broadcast({
        companyId: p.companyId!,
        message: `${header}\n\nID: ${p.entityId}`,
        eventClass,
      });
      return;
    }

    await this.broadcast.broadcast({
      companyId: p.companyId!,
      branchId: group.branchId,
      message: this.buildGroupMessage(header, dateLabel, group, to),
      eventClass,
    });
  }

  /** Composes the rich multi-line group message from the loaded group row. */
  private buildGroupMessage(
    header: string,
    dateLabel: string,
    group: {
      name: string;
      level: string | null;
      lessonStartTime: string | null;
      lessonEndTime: string | null;
      exactDays: string[];
      startDate: Date | null;
      endDate: Date | null;
      course: { name: string } | null;
      branch: { name: string } | null;
      room: { name: string } | null;
      teachers: { teacher: { firstName: string; lastName: string } }[];
    },
    to: string,
  ): string {
    const lines: string[] = [header, '', `📚 <b>${escapeHtml(group.name)}</b>`];

    if (group.branch?.name) {
      lines.push(`🏢 Filial: ${escapeHtml(group.branch.name)}`);
    }
    if (group.level) {
      lines.push(`📊 Daraja: ${escapeHtml(group.level)}`);
    }
    if (group.course?.name) {
      lines.push(`📘 Kurs: ${escapeHtml(group.course.name)}`);
    }
    const teachers = group.teachers
      .map((t) => `${t.teacher.firstName} ${t.teacher.lastName}`.trim())
      .filter(Boolean)
      .join(', ');
    if (teachers) {
      lines.push(`👩‍🏫 O'qituvchi: ${escapeHtml(teachers)}`);
    }
    const days = group.exactDays.map((d) => WEEKDAY_LABELS[d] ?? d).join(', ');
    if (days) {
      lines.push(`📅 Kunlar: ${escapeHtml(days)}`);
    }
    if (group.lessonStartTime && group.lessonEndTime) {
      lines.push(`🕐 Vaqt: ${group.lessonStartTime}–${group.lessonEndTime}`);
    }
    if (group.room?.name) {
      lines.push(`🚪 Xona: ${escapeHtml(group.room.name)}`);
    }
    const date = to === 'COMPLETED' ? group.endDate : group.startDate;
    if (date) {
      lines.push(`📆 ${dateLabel}: ${formatDate(date)}`);
    }
    return lines.join('\n');
  }

  /**
   * Maps a Student status transition to its message header + whether a reason
   * line is relevant. Returns null for transitions we don't broadcast (most
   * internal cascades). Group transitions are handled separately by
   * broadcastGroupStatusChange.
   */
  private studentStatusHeader(
    from: string,
    to: string,
  ): { header: string; showReason: boolean } | null {
    if (from === 'ACTIVE' && to === 'FROZEN') {
      return { header: "❄️ <b>O'quvchi muzlatildi</b>", showReason: true };
    }
    if (from === 'ACTIVE' && to === 'EXPELLED') {
      return { header: "🚫 <b>O'quvchi chetlatildi</b>", showReason: true };
    }
    if (from === 'ACTIVE' && to === 'GRADUATED') {
      return { header: "🎓 <b>O'quvchi bitirdi</b>", showReason: false };
    }
    if (from === 'FROZEN' && to === 'ACTIVE') {
      return { header: "✅ <b>O'quvchi qaytadan faol</b>", showReason: false };
    }
    return null;
  }

  /**
   * Builds the enriched Uzbek message for a Student status transition and
   * resolves the branch to route it to. Mirrors broadcastGroupStatusChange:
   * the event carries only the student id, so we look up the real details —
   * full name, branch, every active group with its teacher(s), the reason
   * (freeze/expel), the Tashkent-time stamp, and which admin made the change.
   *
   * Falls back to a minimal ID-only message (branchId null → company-wide) if
   * the student row can't be loaded — e.g. the emitting transaction rolled
   * back after the event fired.
   */
  private async buildStudentStatusMessage(
    p: EntityStatusChangedEvent,
  ): Promise<{ message: string; branchId: number | null } | null> {
    if (p.entityType !== 'Student') return null;
    const from = p.oldStatus;
    const to = p.newStatus;
    if (!from || !to || from === to) return null;

    const head = this.studentStatusHeader(from, to);
    if (!head) return null;

    const studentId = Number(p.entityId);
    const student = Number.isFinite(studentId)
      ? await this.prisma.student.findUnique({
          where: { id: studentId },
          select: {
            firstName: true,
            lastName: true,
            branches: {
              take: 1,
              select: { branch: { select: { id: true, name: true } } },
            },
            enrollments: {
              where: { status: 'ACTIVE', deletedAt: null },
              select: {
                group: {
                  select: {
                    name: true,
                    course: { select: { name: true } },
                    teachers: {
                      select: {
                        teacher: {
                          select: { firstName: true, lastName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : null;

    if (!student) {
      // Minimal fallback keeps the old behaviour when the row is gone.
      return { message: `${head.header}\n\nID: ${p.entityId}`, branchId: null };
    }

    const fullName = `${student.firstName} ${student.lastName}`.trim();
    const lines: string[] = [
      head.header,
      '',
      `👤 ${escapeHtml(fullName)}  ·  ID: ${p.entityId}`,
    ];

    const branch = student.branches[0]?.branch ?? null;
    if (branch?.name) {
      lines.push(`🏢 Filial: ${escapeHtml(branch.name)}`);
    }

    const groups = student.enrollments
      .map((e) => e.group)
      .filter((g): g is NonNullable<typeof g> => Boolean(g));
    if (groups.length) {
      lines.push('📚 Guruhlar:');
      for (const g of groups) {
        const teachers = g.teachers
          .map((t) => `${t.teacher.firstName} ${t.teacher.lastName}`.trim())
          .filter(Boolean)
          .join(', ');
        const label = g.course?.name ? `${g.name} (${g.course.name})` : g.name;
        lines.push(
          teachers
            ? `   • ${escapeHtml(label)} — ${escapeHtml(teachers)}`
            : `   • ${escapeHtml(label)}`,
        );
      }
    }

    if (head.showReason && p.reason) {
      lines.push(`📝 Sabab: ${escapeHtml(p.reason)}`);
    }

    lines.push(`📅 ${formatDateTime()}`);

    if (p.changedById) {
      const actor = await this.prisma.user.findUnique({
        where: { id: p.changedById },
        select: {
          firstName: true,
          lastName: true,
          roles: { take: 1, select: { role: { select: { name: true } } } },
        },
      });
      if (actor) {
        const actorName = `${actor.firstName} ${actor.lastName}`.trim();
        const role = actor.roles[0]?.role?.name;
        lines.push(
          `✏️ Kim: ${escapeHtml(actorName)}${role ? ` (${escapeHtml(role)})` : ''}`,
        );
      }
    }

    return { message: lines.join('\n'), branchId: branch?.id ?? null };
  }
}
