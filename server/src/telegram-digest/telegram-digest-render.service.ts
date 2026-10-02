import { Injectable } from '@nestjs/common';
import {
  EnrollmentStatus,
  MonthlyChargeStatus,
  TelegramDigestCategory,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDaysToDateStr, tashkentDateStr } from '../common/date/tashkent';
import { formatSom } from '../payments/shared/format-som';
import { PAYMENT_METHOD_LABEL } from '../payments/shared/method-label';
import {
  buildEnrollmentMessage,
  buildRemovalMessage,
} from '../sms/sms-templates';
import { escapeHtml, formatSum } from '../telegram-groups/utils/format.util';
import {
  DIGEST_REASON_MAX_CHARS,
  STUDENT_PORTAL_URL,
} from './telegram-digest.constants';
import { DedupedRow, dedupRows } from './telegram-digest-dedup';
import {
  monthlyBillSection,
  monthlyPaymentClosing,
  paymentReminderSection,
} from './monthly-payment-text';
import {
  payloadOf,
  TaskDigestPayload,
  TelegramDigestItemRow,
} from './telegram-digest-payloads';
import {
  clipText,
  DigestBlock,
  header,
  spacer,
} from './telegram-message-parts';

export interface AuditEntry {
  /** The shown row this SmsMessage stands for. */
  itemId: string;
  /** The event's text exactly as it appears in the digest. */
  content: string;
  senderUserId: number | null;
  companyId: number;
}

export interface RenderedDigest {
  blocks: DigestBlock[];
  /** STUDENT only: one SmsMessage per shown event (ADR-0025 audit rule). */
  audit: AuditEntry[];
  /** Rows read but deliberately not shown — a debt already paid, a charge reversed. */
  hiddenIds: string[];
}

/** A fresh empty result — never share arrays between calls. */
const nothing = (): RenderedDigest => ({
  blocks: [],
  audit: [],
  hiddenIds: [],
});

const TASK_VERB: Partial<Record<TelegramDigestCategory, string>> = {
  TASK_ASSIGNED: 'sizga topshiriq berdi',
  TASK_UPDATED: 'topshiriqni yangiladi',
  TASK_DELETED: "topshiriqni o'chirdi",
};

const TASK_STATUS_LABEL: Record<string, string> = {
  SEEN: "ko'rdi",
  DONE: 'bajardi',
};

/** 'YYYY-MM-DD' → 'DD.MM.YYYY'. */
function formatIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return y && m && d ? `${d}.${m}.${y}` : isoDate;
}

const nullableEscape = (value: string | null) =>
  value === null ? null : escapeHtml(value);

/**
 * Renders the 20:00 personal digest from one person's queued rows. The
 * student's balance and debt are re-read here — never trusted from the
 * payload — because a figure written hours earlier may be stale by now.
 */
@Injectable()
export class TelegramDigestRenderService {
  constructor(private readonly prisma: PrismaService) {}

  async renderStudent(
    studentId: number,
    rows: TelegramDigestItemRow[],
    now: Date = new Date(),
  ): Promise<RenderedDigest> {
    if (rows.length === 0) return nothing();
    const allHidden = { ...nothing(), hiddenIds: rows.map((r) => r.id) };

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { firstName: true, balance: true },
    });
    if (!student) return allHidden;

    const entries = dedupRows(rows);
    const of = (...categories: TelegramDigestCategory[]) =>
      entries.filter((e) => categories.includes(e.row.category));
    const payments = of(
      TelegramDigestCategory.PAYMENT_RECEIVED,
      TelegramDigestCategory.PAYMENT_REVERSED,
    );
    const notices = of(
      TelegramDigestCategory.STUDENT_ENROLLED,
      TelegramDigestCategory.STUDENT_REMOVED,
    );
    const debts = of(TelegramDigestCategory.DEBT_CHARGE);
    const liveDebts = await this.stillCharged(studentId, debts);
    const showDebt = liveDebts.length > 0 && student.balance < 0;

    // The monthly bill and the reminder (ADR-0042). A reminder is only for a
    // student who still owes: one who paid during the day gets none.
    const today = tashkentDateStr(now);
    const owes = student.balance < 0;
    const monthly = await this.liveMonthly(
      of(TelegramDigestCategory.MONTHLY_CHARGE),
      owes ? of(TelegramDigestCategory.PAYMENT_REMINDER) : [],
      today,
    );

    const shown = new Set<DedupedRow>([
      ...(showDebt ? liveDebts : []),
      ...monthly.bills,
      ...monthly.reminders,
    ]);
    const hiddenIds = of(
      TelegramDigestCategory.DEBT_CHARGE,
      TelegramDigestCategory.MONTHLY_CHARGE,
      TelegramDigestCategory.PAYMENT_REMINDER,
    )
      .filter((e) => !shown.has(e))
      .flatMap((e) => e.ids);

    const audit: AuditEntry[] = [];
    const eventBlock = (
      entry: DedupedRow,
      text: string,
      senderUserId: number | null = null,
    ): DigestBlock => {
      audit.push({
        itemId: entry.row.id,
        content: text,
        senderUserId,
        companyId: entry.row.companyId,
      });
      return { text, itemIds: entry.ids };
    };

    const sections: DigestBlock[][] = [];
    if (payments.length > 0) {
      sections.push([
        header("💳 <b>To'lovlar</b>"),
        ...payments.map((e) =>
          eventBlock(e, this.paymentText(e.row), this.performerOf(e.row)),
        ),
      ]);
    }
    if (notices.length > 0) {
      sections.push([
        header('📚 <b>Guruh</b>'),
        // The notices are multi-line templates — keep a blank line between them.
        ...notices.flatMap((e, i) => {
          const block = eventBlock(e, this.noticeText(e.row), null);
          return i === 0 ? [block] : [spacer(), block];
        }),
      ]);
    }
    if (monthly.bills.length > 0) {
      sections.push(
        monthlyBillSection(monthly.bills, student.balance, today, eventBlock),
      );
    }
    if (monthly.reminders.length > 0) {
      sections.push(
        paymentReminderSection(monthly.reminders, -student.balance, eventBlock),
      );
    }
    if (showDebt) {
      sections.push([
        header('⚠️ <b>Qarzga yozilgan darslar</b>'),
        ...liveDebts.map((e) => eventBlock(e, this.debtText(e.row), null)),
        {
          text: [
            `Hozirgi qarz: <b>${formatSum(-student.balance)}</b>`,
            "Iltimos, balansingizni to'ldiring.",
            `🔗 Profilingiz: ${STUDENT_PORTAL_URL}`,
          ].join('\n'),
          itemIds: [],
        },
      ]);
    }
    if (sections.length === 0) return allHidden;

    const blocks: DigestBlock[] = [];
    if (student.firstName) {
      blocks.push({
        text: `Hurmatli ${escapeHtml(student.firstName)}!`,
        itemIds: [],
      });
    }
    for (const section of sections) blocks.push(spacer(), ...section);
    // The bill and the reminder already state the balance.
    const monthlyShown =
      monthly.bills.length > 0 || monthly.reminders.length > 0;
    if (payments.length > 0 && !showDebt && !monthlyShown) {
      blocks.push(spacer(), {
        text: `Joriy balansingiz: <b>${formatSum(student.balance)}</b>`,
        itemIds: [],
      });
    }
    // The bill's and the reminder's closing lines, then the ones today's
    // instant receipt and reversal notice end with.
    const askToPay = monthly.bills.length > 0 && owes;
    const reversed = payments.some(
      (e) => e.row.category === TelegramDigestCategory.PAYMENT_REVERSED,
    );
    // A reversal's «questions» line joins the monthly closing, before the
    // profile link; on its own it keeps the reversal notice's wording.
    const closing = monthlyPaymentClosing(
      askToPay,
      monthly.reminders.length > 0 || (askToPay && reversed),
    );
    if (reversed && closing.length === 0) {
      closing.push("Savollar bo'lsa, markazga murojaat qiling.");
    }
    if (
      (monthly.bills.length > 0 && !owes) ||
      payments.some(
        (e) => e.row.category === TelegramDigestCategory.PAYMENT_RECEIVED,
      )
    ) {
      closing.push('Rahmat!');
    }
    if (closing.length > 0) {
      blocks.push(spacer(), { text: closing.join('\n'), itemIds: [] });
    }
    return { blocks, audit, hiddenIds };
  }

  renderUser(
    rows: TelegramDigestItemRow[],
    now: Date = new Date(),
  ): RenderedDigest {
    if (rows.length === 0) return nothing();
    const entries = dedupRows(rows);
    const today = tashkentDateStr(now);
    const of = (...categories: TelegramDigestCategory[]) =>
      entries.filter((e) => categories.includes(e.row.category));

    const attendance = of(TelegramDigestCategory.ATTENDANCE_COMPLETED);
    const forfeited = of(TelegramDigestCategory.LESSON_PAY_FORFEITED);
    const tasks = of(
      TelegramDigestCategory.TASK_ASSIGNED,
      TelegramDigestCategory.TASK_UPDATED,
      TelegramDigestCategory.TASK_DELETED,
      TelegramDigestCategory.TASK_STATUS_CHANGED,
    );
    const salary = of(TelegramDigestCategory.SALARY_CARRIED_OVER);
    const corrections = of(TelegramDigestCategory.PAYMENT_CORRECTED);

    const sections: DigestBlock[][] = [];
    if (attendance.length > 0) {
      sections.push([
        header('✅ <b>Davomat qabul qilindi</b>'),
        ...attendance.map((e) => ({
          text: this.attendanceText(e.row, today),
          itemIds: e.ids,
        })),
      ]);
    }
    if (forfeited.length > 0) {
      sections.push([
        header('⚠️ <b>Davomat vaqtida olinmagan darslar</b>'),
        ...forfeited.map((e) => ({
          text: this.forfeitedText(e.row),
          itemIds: e.ids,
        })),
        { text: 'Bu darslar uchun haq yozilmadi.', itemIds: [] },
      ]);
    }
    if (tasks.length > 0) {
      sections.push([
        header('📝 <b>Topshiriqlar</b>'),
        ...tasks.map((e) => ({ text: this.taskText(e.row), itemIds: e.ids })),
      ]);
    }
    if (salary.length > 0) {
      let count = 0;
      let total = 0;
      for (const e of salary) {
        const p = payloadOf(e.row, TelegramDigestCategory.SALARY_CARRIED_OVER);
        count += p.count;
        total += p.total;
      }
      sections.push([
        header('💵 <b>Oylik</b>'),
        {
          text: `Kechikkan to'lov tufayli oldingi oydagi ${count} ta dars uchun <b>${formatSum(total)}</b> joriy oyligingizga qo'shildi.`,
          itemIds: salary.flatMap((e) => e.ids),
        },
      ]);
    }
    if (corrections.length > 0) {
      sections.push([
        header("✏️ <b>To'g'irlangan to'lovlar</b>"),
        ...corrections.map((e) => ({
          text: this.correctionText(e.row),
          itemIds: e.ids,
        })),
      ]);
    }

    const blocks = sections.flatMap((section, i) =>
      i === 0 ? section : [spacer(), ...section],
    );
    return { blocks, audit: [], hiddenIds: [] };
  }

  /**
   * A queued charge is shown only while its SINGLE_UNCOVERED deduction still
   * stands: a lesson re-marked as excused before 20:00 was refunded and must
   * not be reported as debt.
   */
  private async stillCharged(
    studentId: number,
    debts: DedupedRow[],
  ): Promise<DedupedRow[]> {
    if (debts.length === 0) return [];
    const attendanceIdOf = (e: DedupedRow) =>
      payloadOf(e.row, TelegramDigestCategory.DEBT_CHARGE).attendanceId;
    const live = await this.prisma.transaction.findMany({
      where: {
        studentId,
        attendanceId: { in: debts.map(attendanceIdOf) },
        type: TransactionType.LESSON_DEDUCTION,
        reversedAt: null,
        metadata: { path: ['mode'], equals: 'SINGLE_UNCOVERED' },
      },
      select: { attendanceId: true },
    });
    const liveIds = new Set(live.map((t) => t.attendanceId));
    return debts.filter((e) => liveIds.has(attendanceIdOf(e)));
  }

  /**
   * A bill is sent only while its charge stands and the student is still in
   * that group: a charge reversed, or a student removed or frozen, during the
   * day gets no bill. A reminder only for tomorrow's lesson — a row kept
   * after a failed send would otherwise say «Ertaga» about a past day — and
   * only while the enrollment is open. Contract 3.7's reminder (ADR-0064)
   * only on the day it was queued for, and not on an evening the 2nd-lesson
   * reminder goes out: one reminder a day.
   */
  private async liveMonthly(
    bills: DedupedRow[],
    reminders: DedupedRow[],
    today: string,
  ): Promise<{ bills: DedupedRow[]; reminders: DedupedRow[] }> {
    const chargeIdOf = (e: DedupedRow) =>
      payloadOf(e.row, TelegramDigestCategory.MONTHLY_CHARGE).chargeId;
    const reminderOf = (e: DedupedRow) =>
      payloadOf(e.row, TelegramDigestCategory.PAYMENT_REMINDER);
    const tomorrow = addDaysToDateStr(today, 1);
    const fresh = reminders.filter((e) => {
      const p = reminderOf(e);
      return p.paidThrough
        ? p.paidThrough.queuedFor === today
        : p.lessonDate === tomorrow;
    });
    const secondLesson = fresh.filter((e) => !reminderOf(e).paidThrough);
    const dueTomorrow = secondLesson.length > 0 ? secondLesson : fresh;

    const standing =
      bills.length === 0
        ? []
        : await this.prisma.enrollmentMonthlyCharge.findMany({
            where: {
              id: { in: bills.map(chargeIdOf) },
              status: MonthlyChargeStatus.CHARGED,
              enrollment: { status: EnrollmentStatus.ACTIVE },
            },
            select: { id: true },
          });
    const open =
      dueTomorrow.length === 0
        ? []
        : await this.prisma.enrollment.findMany({
            where: {
              id: { in: dueTomorrow.map((e) => reminderOf(e).enrollmentId) },
              status: EnrollmentStatus.ACTIVE,
            },
            select: { id: true },
          });
    const standingIds = new Set(standing.map((c) => c.id));
    const openIds = new Set(open.map((e) => e.id));
    return {
      bills: bills.filter((e) => standingIds.has(chargeIdOf(e))),
      reminders: dueTomorrow.filter((e) =>
        openIds.has(reminderOf(e).enrollmentId),
      ),
    };
  }

  private paymentText(row: TelegramDigestItemRow): string {
    if (row.category === TelegramDigestCategory.PAYMENT_RECEIVED) {
      const p = payloadOf(row, TelegramDigestCategory.PAYMENT_RECEIVED);
      const method = PAYMENT_METHOD_LABEL[p.method] ?? p.method;
      return [
        `• <b>${formatSum(p.amount)}</b> to'lovingiz qabul qilindi (${escapeHtml(method)})`,
        `📄 Kvitansiya: ${escapeHtml(p.receiptUrl)}`,
      ].join('\n');
    }
    const p = payloadOf(row, TelegramDigestCategory.PAYMENT_REVERSED);
    const lines = [`• <b>${formatSum(p.amount)}</b> to'lovingiz bekor qilindi`];
    if (p.reason) {
      lines.push(
        `Sabab: ${escapeHtml(clipText(p.reason, DIGEST_REASON_MAX_CHARS))}`,
      );
    }
    return lines.join('\n');
  }

  private performerOf(row: TelegramDigestItemRow): number | null {
    return row.category === TelegramDigestCategory.PAYMENT_RECEIVED
      ? payloadOf(row, TelegramDigestCategory.PAYMENT_RECEIVED).performedById
      : payloadOf(row, TelegramDigestCategory.PAYMENT_REVERSED).performedById;
  }

  /** Today's instant templates, with every interpolated value escaped. */
  private noticeText(row: TelegramDigestItemRow): string {
    if (row.category === TelegramDigestCategory.STUDENT_ENROLLED) {
      const p = payloadOf(row, TelegramDigestCategory.STUDENT_ENROLLED);
      return buildEnrollmentMessage({
        groupName: escapeHtml(p.groupName),
        courseName: escapeHtml(p.courseName),
        days: nullableEscape(p.days),
        exactDays: p.exactDays.map((d) => escapeHtml(d)),
        lessonStartTime: nullableEscape(p.lessonStartTime),
        lessonEndTime: nullableEscape(p.lessonEndTime),
      });
    }
    const p = payloadOf(row, TelegramDigestCategory.STUDENT_REMOVED);
    return buildRemovalMessage({
      groupName: escapeHtml(p.groupName),
      reason: escapeHtml(clipText(p.reason, DIGEST_REASON_MAX_CHARS)),
    });
  }

  private debtText(row: TelegramDigestItemRow): string {
    const p = payloadOf(row, TelegramDigestCategory.DEBT_CHARGE);
    const price = p.perLessonCost > 0 ? ` — ${formatSum(p.perLessonCost)}` : '';
    return `• ${escapeHtml(p.groupName)} (${formatIsoDate(p.date)})${price}`;
  }

  private forfeitedText(row: TelegramDigestItemRow): string {
    const p = payloadOf(row, TelegramDigestCategory.LESSON_PAY_FORFEITED);
    return `• ${escapeHtml(p.groupName)} (${formatIsoDate(p.date)})`;
  }

  private attendanceText(row: TelegramDigestItemRow, today: string): string {
    const p = payloadOf(row, TelegramDigestCategory.ATTENDANCE_COMPLETED);
    const counts: [string, number][] = [
      ['Keldi', p.present],
      ['Kelmadi', p.absent],
      ['Kechikdi', p.late],
      ['Sababli', p.excused],
    ];
    const stats = counts
      .filter(([, n]) => n > 0)
      .map(([label, n]) => `${label}: ${n}`)
      .join(' / ');
    const date = p.date === today ? '' : ` (${formatIsoDate(p.date)})`;
    return `• ${escapeHtml(p.groupName)}${date}${stats ? ` — ${stats}` : ''}`;
  }

  private taskText(row: TelegramDigestItemRow): string {
    if (row.category === TelegramDigestCategory.TASK_STATUS_CHANGED) {
      const p = payloadOf(row, TelegramDigestCategory.TASK_STATUS_CHANGED);
      const label = TASK_STATUS_LABEL[p.status] ?? p.status;
      return `• ${escapeHtml(p.assigneeName)} topshiriqni ${escapeHtml(label)}: "${escapeHtml(p.content)}"`;
    }
    // TASK_ASSIGNED / TASK_UPDATED / TASK_DELETED share one payload shape.
    const p = row.payload as unknown as TaskDigestPayload;
    const verb = TASK_VERB[row.category] ?? 'topshiriqni yangiladi';
    return `• ${escapeHtml(p.authorName)} ${verb}: "${escapeHtml(p.content)}"`;
  }

  /** Same wording as the instant CEO alert in notification-events.listener. */
  private correctionText(row: TelegramDigestItemRow): string {
    const p = payloadOf(row, TelegramDigestCategory.PAYMENT_CORRECTED);
    const changes: string[] = [];
    if (p.oldAmount !== p.newAmount) {
      changes.push(
        `${formatSom(p.oldAmount)} → ${formatSom(p.newAmount)} so'm`,
      );
    }
    if (p.oldMethod !== p.newMethod) {
      changes.push(
        `${PAYMENT_METHOD_LABEL[p.oldMethod] ?? p.oldMethod} → ${PAYMENT_METHOD_LABEL[p.newMethod] ?? p.newMethod}`,
      );
    }
    const reason = escapeHtml(clipText(p.reason, DIGEST_REASON_MAX_CHARS));
    return `• ${escapeHtml(p.performerName)} ${escapeHtml(p.studentName)}ning to'lovini to'g'riladi: ${changes.join(', ')}. Sabab: ${reason}`;
  }
}
