import { Injectable, Logger } from '@nestjs/common';
import {
  GroupStatus,
  EnrollmentStatus,
  RoomStatus,
  BranchStatus,
  CourseStatus,
  PaymentModel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EntityHistoryService,
  type EntityStatusChangedEvent,
} from '../entity-history';
import { EnrollmentBillingService } from '../../billing/enrollment-billing.service';
import {
  type DepartureOutcome,
  MonthlyChargeService,
} from '../../billing/monthly-charge.service';
import {
  DEFAULT_DEPARTURE_POLICY,
  type DeparturePolicy,
} from '../../billing/departure-policy';
import { departureMoneyNote } from '../../billing/departure-money-note';
import { tashkentDateStr } from '../../attendance/shared/date-utils';
import { graduateStudentsOfCompletedGroup } from './group-graduation';

interface CascadeResult {
  entity: string;
  count: number;
  toStatus: string;
}

/**
 * Why an enrolment closed, in the words shown in the student's and the
 * group's history. The one-off repairs of older closures write the same words.
 */
export const GROUP_DELETED_REASON = "Guruh o'chirildi";
export const GROUP_CANCELLED_REASON = "Guruh to'xtatildi";
export const GROUP_COMPLETED_WHILE_FROZEN_REASON =
  "Guruh tugallandi, o'quvchi muzlatilgan edi";
export const BRANCH_CLOSED_REASON = 'Filial yopildi';
export const BRANCH_ARCHIVED_REASON = 'Filial arxivlandi';
export const COURSE_ARCHIVED_REASON = 'Kurs arxivlandi';

/**
 * An enrolment is open while ACTIVE or FROZEN. Closing its group, branch or
 * course closes both: a FROZEN one left behind keeps the student in a group
 * that no longer runs for every reader of the enrolment rows (ADR-0036).
 */
const OPEN_ENROLLMENT: Prisma.EnrollmentWhereInput['status'] = {
  in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.FROZEN],
};

/**
 * The reason an enrolment closed by a group deletion carries: the fixed
 * words, then what the admin typed in the delete dialog, if anything. It is
 * what the student's closed-groups list, their history, the departed-students
 * report and the refund's ledger row show.
 */
function groupDeletedReason(note?: string): string {
  return note ? `${GROUP_DELETED_REASON}: ${note}` : GROUP_DELETED_REASON;
}

/**
 * The enrolments deleting a group closes: its live ones, ACTIVE and FROZEN.
 * The delete dialog counts with this same filter
 * (`GroupsReadService.getDeletePreview`), so the number the admin confirms
 * is the number that closes.
 */
export function liveEnrollmentsOfGroup(
  groupId: string,
): Prisma.EnrollmentWhereInput {
  return {
    groupId,
    deletedAt: null,
    status: OPEN_ENROLLMENT,
  };
}

/**
 * The reason every enrolment a group's own CANCELLED/COMPLETED closed
 * carries, in its `statusChangeReason` and its state-log row. Written only
 * here, so the words stay one thing: the one-off repair of closed groups
 * writes the same ones.
 */
export function groupClosingReason(
  groupId: string,
  status: GroupStatus,
): string {
  return `Cascade: Group #${groupId} → ${status}`;
}

/**
 * What `cascade()` handles. A group's own status change is not among them:
 * it closes its enrolments on the caller's transaction
 * (`cascadeGroupStatusChange`, ADR-0041).
 */
export type CascadeEntityType = 'Branch' | 'Course' | 'Student';

/**
 * The groups a branch or course status change cancels, or null when it
 * cancels none. `cascade()` closes exactly these, and the branch and course
 * services check them before writing anything (ADR-0068: no group closes
 * with a «Dars bo'ldimi?» question unanswered).
 */
export function groupsCancelledBy(
  entityType: CascadeEntityType,
  entityId: string,
  newStatus: string,
): Prisma.GroupWhereInput | null {
  const live = {
    deletedAt: null,
    statusEnum: { not: GroupStatus.ARCHIVED },
  };
  if (
    entityType === 'Branch' &&
    (newStatus === BranchStatus.CLOSED || newStatus === BranchStatus.ARCHIVED)
  ) {
    return { branchId: Number(entityId), ...live };
  }
  if (entityType === 'Course' && newStatus === CourseStatus.ARCHIVED) {
    return { courseId: entityId, ...live };
  }
  return null;
}

/** One enrolment's month settled by a student's departure (ADR-0043). */
export interface DepartureMoneyNote {
  groupName: string;
  /** The «pul» line, as `departureMoneyNote` words it. */
  note: string;
}

export interface CascadeOptions {
  /**
   * Who ended a student's enrolments (contract 6.2, ADR-0043). Read only by
   * a student's EXPELLED cascade, where it defaults to the student's own
   * decision. An ARCHIVED card is a record made by mistake, not a departure,
   * and every other cascade is the centre's closing: both keep the old rule
   * (the unheld lessons come back).
   */
  departurePolicy?: DeparturePolicy;
  /** Receives one line per enrolment whose month an expulsion settled. */
  moneyNotes?: DepartureMoneyNote[];
}

/** An enrolment a student cascade is about to change, for its group's history. */
interface StudentCascadeEnrollment {
  id: string;
  groupId: string;
  group: { companyId: number; name: string };
  student: { firstName: string; lastName: string };
}

@Injectable()
export class StatusCascadeService {
  private readonly logger = new Logger(StatusCascadeService.name);

  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private enrollmentBillingService: EnrollmentBillingService,
    private monthlyChargeService: MonthlyChargeService,
  ) {}

  /**
   * Closes every live enrolment of a group that is being deleted — ACTIVE and
   * FROZEN alike — as DROPPED, on the CALLER's transaction, so the group and
   * its enrolments are archived together or not at all.
   *
   * Everything else closing an enrolment does happens here too: the unused
   * prepaid lessons and the rest of the month's charge go back to the balance,
   * the state log gets a DROPPED row, and the removal is written to each
   * student's history and to the group's. The admin's reason, if any,
   * follows the fixed words (`groupDeletedReason`). Enrolments already closed
   * are not selected, so a second run changes nothing.
   */
  async cascadeGroupDeletion(
    tx: Prisma.TransactionClient,
    params: {
      groupId: string;
      userId: number;
      at: Date;
      /** What the admin typed in the delete dialog, trimmed; none if absent. */
      note?: string;
    },
  ): Promise<{ count: number }> {
    const filter = liveEnrollmentsOfGroup(params.groupId);
    const reason = groupDeletedReason(params.note);

    await this.recordRemovals(filter, reason, params.userId, tx);

    const { count } = await this.cascadeEnrollmentStatus(
      filter,
      EnrollmentStatus.DROPPED,
      reason,
      params.userId,
      {
        statusChangedAt: params.at,
        statusChangedById: params.userId,
        statusChangeReason: reason,
      },
      tx,
    );
    return { count };
  }

  /**
   * Closes a group's enrolments when the group itself goes CANCELLED or
   * COMPLETED, on the CALLER's transaction, so the status change and its
   * students' closing commit together or not at all (ADR-0041).
   *
   * CANCELLED drops every ACTIVE and FROZEN enrolment. COMPLETED completes
   * the ACTIVE ones, drops the FROZEN ones (ADR-0036) and graduates the
   * students it leaves without an ACTIVE enrolment. Any other status closes
   * nothing. Money steps run on `tx`, so one failed refund rolls the whole
   * change back. Status-change events land in `deferredEvents`, for the
   * caller to emit after the commit.
   */
  async cascadeGroupStatusChange(
    tx: Prisma.TransactionClient,
    params: {
      groupId: string;
      status: GroupStatus;
      userId: number;
      at: Date;
      deferredEvents: EntityStatusChangedEvent[];
    },
  ): Promise<CascadeResult[]> {
    const { groupId, status, userId, at, deferredEvents } = params;
    if (status !== GroupStatus.CANCELLED && status !== GroupStatus.COMPLETED) {
      return [];
    }
    const reason = groupClosingReason(groupId, status);
    const auditFields = {
      statusChangedAt: at,
      statusChangedById: userId,
      statusChangeReason: reason,
    };
    const ofGroup = (
      enrollmentStatus: Prisma.EnrollmentWhereInput['status'],
    ): Prisma.EnrollmentWhereInput => ({
      groupId,
      deletedAt: null,
      status: enrollmentStatus,
    });
    const results: CascadeResult[] = [];
    const tally = (entity: string, count: number, toStatus: string) =>
      results.push({ entity, count, toStatus });

    if (status === GroupStatus.CANCELLED) {
      const open = ofGroup(OPEN_ENROLLMENT);
      await this.recordRemovals(open, GROUP_CANCELLED_REASON, userId, tx);
      const dropped = await this.cascadeEnrollmentStatus(
        open,
        EnrollmentStatus.DROPPED,
        reason,
        userId,
        auditFields,
        tx,
      );
      tally('Enrollment', dropped.count, 'DROPPED');
      return results.filter((r) => r.count > 0);
    }

    const active = ofGroup(EnrollmentStatus.ACTIVE);
    await this.recordCompletions(active, userId, tx, deferredEvents);
    const completed = await this.cascadeEnrollmentStatus(
      active,
      EnrollmentStatus.COMPLETED,
      reason,
      userId,
      auditFields,
      tx,
    );
    tally('Enrollment', completed.count, 'COMPLETED');

    // FROZEN → DROPPED, not COMPLETED: the student was frozen when the group
    // ended, so they did not finish it (ADR-0036). Graduation reads
    // COMPLETED rows only and never picks them.
    const frozen = ofGroup(EnrollmentStatus.FROZEN);
    await this.recordRemovals(
      frozen,
      GROUP_COMPLETED_WHILE_FROZEN_REASON,
      userId,
      tx,
    );
    const dropped = await this.cascadeEnrollmentStatus(
      frozen,
      EnrollmentStatus.DROPPED,
      reason,
      userId,
      auditFields,
      tx,
    );
    tally('Enrollment', dropped.count, 'DROPPED');

    const graduated = await graduateStudentsOfCompletedGroup(
      tx,
      this.entityHistoryService,
      { groupId, userId, at, deferredEvents },
    );
    tally('Student', graduated.length, 'GRADUATED');

    return results.filter((r) => r.count > 0);
  }

  /**
   * Cascade enrollment status update + activity-report state log entries.
   * Use this in place of `prisma.enrollment.updateMany` whenever the cascade
   * mutates enrollment status, so that historical reports can replay the
   * transition. Returns the same shape as updateMany.
   *
   * With `tx` everything runs on the caller's transaction and a failed money
   * step propagates, rolling the caller back. Without it each enrolment's
   * money step gets its own transaction and a failure is logged, so one bad
   * enrolment cannot hold up a branch-wide batch.
   */
  private async cascadeEnrollmentStatus(
    filter: Prisma.EnrollmentWhereInput,
    newStatus: EnrollmentStatus,
    reason: string | null,
    userId: number | undefined,
    auditFields: Prisma.EnrollmentUncheckedUpdateManyInput,
    tx?: Prisma.TransactionClient,
    departurePolicy?: DeparturePolicy,
  ): Promise<{ count: number; departures: Map<string, DepartureOutcome> }> {
    const db = tx ?? this.prisma;
    // What each enrolment's month came to, for the callers that put it into
    // history. Only a money step that went through is recorded here.
    const departures = new Map<string, DepartureOutcome>();
    const matches = await db.enrollment.findMany({
      where: filter,
      select: {
        id: true,
        group: {
          select: {
            companyId: true,
            course: { select: { paymentModel: true } },
          },
        },
      },
    });

    // Closing an enrollment (DROPPED/COMPLETED) strands any unused prepaid
    // lessons — convert them back to balance first, the same rule as
    // removeFromGroup()/transfer. Each refund runs in a Serializable tx —
    // its own, or the caller's when one is passed (createAdjustment locks
    // the student row). Without this, cascade paths (student
    // EXPELLED/ARCHIVED, group CANCELLED/COMPLETED/deleted, branch close,
    // course archive) silently lose the student's money — the 2026-06 audit
    // found 7 production victims (~630k so'm).
    //
    // The MONTHLY counterpart runs in the SAME per-enrollment tx, right
    // alongside the LESSON_PACK refund — mirrors removeFromGroup(). The two
    // calls are mutually exclusive in practice without needing to branch on
    // `Course.paymentModel` here: `refundPrepaidToBalance` no-ops when
    // `prepaidLessonsRemaining` is 0 (always true for a MONTHLY enrollment),
    // and `reverseChargeForDeparture` no-ops when no `EnrollmentMonthlyCharge`
    // row exists for the period (always true for LESSON_PACK, since only
    // the MONTHLY billing path ever writes that table). Before this, a
    // MONTHLY student dropped through ANY cascade route (group cancelled,
    // student EXPELLED/ARCHIVED, branch closed, course archived) kept a
    // full un-refunded charge for lessons they would never take — same bug
    // shape as the missing prepaid refund above, just for the newer model.
    if (
      newStatus === EnrollmentStatus.DROPPED ||
      newStatus === EnrollmentStatus.COMPLETED
    ) {
      const departureDate =
        (auditFields.statusChangedAt as Date | undefined) ?? new Date();
      // Captured ONCE, alongside departureDate, and threaded into every
      // iteration below as `reverseChargeForDeparture`'s `today` — a batch
      // of hundreds of enrollments (branch close) can straddle Toshkent
      // yarim tun across its per-enrollment transactions; re-deriving "bugun"
      // fresh on each iteration would let a later one see a new day and
      // reject `departureDate` as backdated even though the whole batch is
      // the SAME departure event. One clock for the whole batch.
      const departureToday = tashkentDateStr(departureDate);
      for (const m of matches) {
        // Without a caller's transaction (the status-change cascades), one
        // enrollment's refund failing (DB hiccup, lock timeout) must not
        // abort the cascade for the rest. Before `runMoneyStep` caught it, an
        // uncaught throw here (e.g. a genuinely backdated departureDate, or
        // any other error) would bail out of the `for` loop entirely, so
        // `enrollment.updateMany` below would NEVER run — leaving every
        // earlier iteration's refund already committed against an enrollment
        // still sitting ACTIVE. On a caller's transaction the failure rolls
        // everything back instead.
        const settled = await this.runMoneyStep(
          tx,
          async (client) => {
            await this.enrollmentBillingService.refundPrepaidToBalance(client, {
              enrollmentId: m.id,
              reason: reason
                ? `Qoldiq oldindan to'langan darslar balansga qaytarildi (${reason})`
                : undefined,
              performedById: userId,
            });
            return this.monthlyChargeService.reverseChargeForDeparture(client, {
              enrollmentId: m.id,
              departureDate,
              today: departureToday,
              companyId: m.group.companyId,
              reason: reason ?? 'Cascade orqali guruhdan chiqarildi',
              performedById: userId,
              policy: departurePolicy,
            });
          },
          `Cascade: enrollment=${m.id} uchun pul qaytarish yiqildi ` +
            `(newStatus=${newStatus}) — qolgan yozilishlar davom etadi`,
        );
        if (settled?.value) departures.set(m.id, settled.value);
      }
    }

    // Task 1B: FROZEN -> ACTIVE (muzlatishdan chiqish) — Task 1 muzlatishda
    // oyning qolgan darslari pulini balansga qaytargan edi
    // (`reverseChargeForDeparture` shu yo'l bilan chaqiriladi, yuqoridagi
    // blok). Bu YERDA teskarisi bajariladi: o'quvchi qaytganda, qaytgan
    // kundan keyingi darslar puli QAYTA balansdan yechiladi — aks holda
    // o'quvchi oyning qolgan qismini TEKIN o'qir edi (pul balansda yotadi,
    // dars berilgan, hech qanday hisob yo'q).
    //
    // A return into a month with no charge yet (the student was frozen when
    // its charge run went by) gets that month charged from the day after the
    // return by the same call. `returnDate` must stay the instant stamped on
    // the enrollment below: the daily charge run reads it back from
    // `statusChangedAt`.
    //
    // `LESSON_PACK` yozilishlar bu yo'lga UMUMAN yetib bormasligi kerak —
    // `restoreChargeForReturn`ning o'zi topilmagan hisobda `null` qaytaradi,
    // lekin shunga tayanib qolish o'rniga bu YERDA `paymentModel` bo'yicha
    // ANIQ filtrlanadi (brief talabi): har bir LESSON_PACK yozilish uchun
    // bekorga bir so'rov yubormaslik + kelajakda funksiya xatti-harakati
    // o'zgarsa ham bu yo'l xavfsiz qolishi uchun.
    if (newStatus === EnrollmentStatus.ACTIVE) {
      const monthlyMatches = matches.filter(
        (m) => m.group.course.paymentModel === PaymentModel.MONTHLY,
      );
      if (monthlyMatches.length > 0) {
        const returnDate =
          (auditFields.statusChangedAt as Date | undefined) ?? new Date();
        // Xuddi yuqoridagi `departureToday` kabi — sikl o'nlab yozilishni
        // ketma-ket Serializable tranzaksiyalarda ishlaydi va real vaqtda
        // Toshkent yarim tunidan o'tib ketishi mumkin. BIR marta hisoblanib,
        // har bir iteratsiyaga bab-baravar uzatiladi (Task 8'da xuddi shu
        // sabab bilan aynan shu joyda ikki marta tuzatilgan xato).
        const returnToday = tashkentDateStr(returnDate);
        for (const m of monthlyMatches) {
          // Bitta yozilishning qayta hisob-kitobi yiqilishi qolgan
          // yozilishlarni to'xtatmasligi kerak — yuqoridagi DROPPED/COMPLETED
          // blokidagi bilan bir xil chidamlilik namunasi.
          await this.runMoneyStep(
            tx,
            async (client) => {
              await this.monthlyChargeService.restoreChargeForReturn(client, {
                enrollmentId: m.id,
                returnDate,
                today: returnToday,
                companyId: m.group.companyId,
                reason: reason ?? 'Cascade orqali muzlatishdan chiqarildi',
                performedById: userId,
              });
            },
            `Cascade: enrollment=${m.id} uchun qayta hisoblash yiqildi ` +
              `(newStatus=${newStatus}) — qolgan yozilishlar davom etadi`,
          );
        }
      }
    }

    const result = await db.enrollment.updateMany({
      where: filter,
      data: { status: newStatus, ...auditFields },
    });

    if (matches.length > 0) {
      // The log row and the enrolment's own `statusChangedAt` name the same
      // moment, so a report replaying the log agrees with the row.
      const transitionAt =
        (auditFields.statusChangedAt as Date | undefined) ?? new Date();
      await db.enrollmentStateLog.createMany({
        data: matches.map((m) => ({
          enrollmentId: m.id,
          status: newStatus,
          transitionAt,
          reason,
          changedById: userId,
        })),
      });
    }

    return { count: result.count, departures };
  }

  /**
   * Runs one enrolment's money step. On the caller's transaction it simply
   * runs and a failure propagates: the caller rolls back, and Postgres cannot
   * carry on inside a failed transaction anyway. Without one it gets its own
   * Serializable transaction and a failure is logged, so the rest of a batch
   * still closes — the resilience pattern of
   * `MonthlyChargeService.createChargesForPeriod`. Returns the step's value,
   * or null when it failed and was logged.
   */
  private async runMoneyStep<T>(
    tx: Prisma.TransactionClient | undefined,
    step: (client: Prisma.TransactionClient) => Promise<T>,
    failureMessage: string,
  ): Promise<{ value: T } | null> {
    if (tx) return { value: await step(tx) };
    try {
      const value = await this.prisma.$transaction(step, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 15_000,
      });
      return { value };
    } catch (err) {
      this.logger.error(failureMessage, err);
      return null;
    }
  }

  /**
   * Writes each enrolment matching `filter` into its student's history and
   * its group's as a removal from the group — the records `removeFromGroup()`
   * writes. Call it BEFORE the flip to DROPPED, while `filter` still selects
   * the open rows.
   */
  private async recordRemovals(
    filter: Prisma.EnrollmentWhereInput,
    sabab: string,
    userId: number | undefined,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const leaving = await (tx ?? this.prisma).enrollment.findMany({
      where: filter,
      select: {
        studentId: true,
        groupId: true,
        student: { select: { firstName: true, lastName: true } },
        group: { select: { name: true, companyId: true } },
      },
    });
    for (const e of leaving) {
      const by = { changedById: userId, companyId: e.group.companyId, tx };
      await this.entityHistoryService.recordDelete({
        entityType: 'Student',
        entityId: e.studentId,
        oldValues: {
          guruh: e.group.name,
          guruhId: e.groupId,
          action: 'GURUHDAN_CHIQARILDI',
          sabab,
        },
        ...by,
      });
      await this.entityHistoryService.recordDelete({
        entityType: 'Group',
        entityId: e.groupId,
        oldValues: {
          action: 'OQUVCHI_CHIQARILDI',
          oquvchi: `${e.student.firstName} ${e.student.lastName}`.trim(),
          oquvchiId: e.studentId,
          sabab,
        },
        ...by,
      });
    }
  }

  /**
   * Writes each enrolment matching `filter` into its student's history as
   * completing the group, on `tx`. The group's own history already says it
   * ended, so nothing is written there. Call it BEFORE the flip to COMPLETED.
   */
  private async recordCompletions(
    filter: Prisma.EnrollmentWhereInput,
    userId: number | undefined,
    tx: Prisma.TransactionClient,
    deferredEvents: EntityStatusChangedEvent[],
  ): Promise<void> {
    const completing = await tx.enrollment.findMany({
      where: filter,
      select: {
        studentId: true,
        groupId: true,
        group: { select: { name: true, companyId: true } },
      },
    });
    for (const e of completing) {
      await this.entityHistoryService.recordStatusChange({
        entityType: 'Student',
        entityId: e.studentId,
        // `statusEnum`, not `status`: listeners of 'entity.status.changed'
        // read `status` as the student's own status and would post a system
        // comment and a Telegram digest line for a change the student never
        // had. The history tab labels both keys "Holat".
        oldValues: { statusEnum: EnrollmentStatus.ACTIVE },
        newValues: {
          statusEnum: EnrollmentStatus.COMPLETED,
          guruhId: e.groupId,
          action: 'GURUH_TUGALLANDI',
          sabab: `«${e.group.name}» guruhi tugallandi`,
        },
        changedById: userId,
        companyId: e.group.companyId,
        tx,
        deferredEvents,
      });
    }
  }

  /**
   * Cascade enrollment o'zgarishlarini guruh tarixiga yozadi.
   * updateMany dan OLDIN chaqirilishi kerak (chunki updateMany individual record qaytarmaydi).
   */
  private async recordGroupHistoryForStudentCascade(
    studentId: number,
    enrollmentFilter: Prisma.EnrollmentWhereInput,
    action: string,
    userId: number | undefined,
    type: 'add' | 'remove' = 'remove',
  ): Promise<void> {
    await this.writeGroupHistoryForStudentCascade(
      studentId,
      await this.loadStudentCascadeEnrollments(enrollmentFilter),
      action,
      userId,
      type,
    );
  }

  private loadStudentCascadeEnrollments(
    enrollmentFilter: Prisma.EnrollmentWhereInput,
  ): Promise<StudentCascadeEnrollment[]> {
    return this.prisma.enrollment.findMany({
      where: enrollmentFilter,
      select: {
        id: true,
        groupId: true,
        group: { select: { companyId: true, name: true } },
        student: { select: { firstName: true, lastName: true } },
      },
    });
  }

  /**
   * One row per enrolment in its group's history. `money` carries the «pul»
   * line of the enrolments whose month a departure settled (ADR-0043).
   */
  private async writeGroupHistoryForStudentCascade(
    studentId: number,
    enrollments: StudentCascadeEnrollment[],
    action: string,
    userId: number | undefined,
    type: 'add' | 'remove',
    money?: Map<string, string>,
  ): Promise<void> {
    const values = (e: StudentCascadeEnrollment) => {
      const pul = money?.get(e.id);
      return {
        action,
        oquvchi: `${e.student.firstName} ${e.student.lastName}`,
        oquvchiId: studentId,
        ...(pul ? { pul } : {}),
      };
    };

    for (const enrollment of enrollments) {
      const common = {
        entityType: 'Group' as const,
        entityId: enrollment.groupId,
        changedById: userId,
        companyId: enrollment.group?.companyId ?? undefined,
      };

      if (type === 'add') {
        await this.entityHistoryService.recordCreate({
          ...common,
          newValues: values(enrollment),
        });
      } else {
        await this.entityHistoryService.recordDelete({
          ...common,
          oldValues: values(enrollment),
        });
      }
    }
  }

  /**
   * Per-Group statusChange tarixini yozadi (Branch/Course cascade'larida).
   * updateMany dan OLDIN chaqirilishi kerak — eski statuslar yo'qolmasligi uchun.
   */
  private async recordGroupBatchStatusChange(
    filter: Prisma.GroupWhereInput,
    toStatus: string,
    reason: string,
    userId: number | undefined,
  ): Promise<void> {
    const groups = await this.prisma.group.findMany({
      where: filter,
      select: { id: true, statusEnum: true, companyId: true },
    });
    for (const group of groups) {
      await this.entityHistoryService.recordStatusChange({
        entityType: 'Group',
        entityId: group.id,
        oldValues: { statusEnum: group.statusEnum, reason },
        newValues: { statusEnum: toStatus, reason },
        changedById: userId,
        companyId: group.companyId ?? undefined,
      });
    }
  }

  /**
   * Per-Room statusChange tarixini yozadi (Branch cascade'larida).
   * updateMany dan OLDIN chaqirilishi kerak.
   */
  private async recordRoomBatchStatusChange(
    filter: Prisma.RoomWhereInput,
    toStatus: string,
    reason: string,
    userId: number | undefined,
  ): Promise<void> {
    const rooms = await this.prisma.room.findMany({
      where: filter,
      select: { id: true, status: true, companyId: true },
    });
    for (const room of rooms) {
      await this.entityHistoryService.recordStatusChange({
        entityType: 'Room',
        entityId: room.id,
        oldValues: { status: room.status, reason },
        newValues: { status: toStatus, reason },
        changedById: userId,
        companyId: room.companyId ?? undefined,
      });
    }
  }

  async cascade(
    entityType: CascadeEntityType,
    entityId: string,
    newStatus: string,
    userId: number | undefined,
    options: CascadeOptions = {},
  ): Promise<CascadeResult[]> {
    const results: CascadeResult[] = [];
    const now = new Date();
    const reason = `Cascade: ${entityType} #${entityId} → ${newStatus}`;

    const auditFields = {
      statusChangedAt: now,
      statusChangedById: userId,
      statusChangeReason: reason,
    };

    if (entityType === 'Branch') {
      const branchId = Number(entityId);

      if (
        newStatus === BranchStatus.CLOSED ||
        newStatus === BranchStatus.ARCHIVED
      ) {
        // Guruhlar → CANCELLED
        const groupFilter = groupsCancelledBy('Branch', entityId, newStatus)!;
        await this.recordGroupBatchStatusChange(
          groupFilter,
          GroupStatus.CANCELLED,
          reason,
          userId,
        );
        const groupResult = await this.prisma.group.updateMany({
          where: groupFilter,
          data: {
            statusEnum: GroupStatus.CANCELLED,
            isActive: false,
            ...auditFields,
          },
        });
        results.push({
          entity: 'Group',
          count: groupResult.count,
          toStatus: 'CANCELLED',
        });

        // Enrollmentlar → DROPPED
        const enrollFilter: Prisma.EnrollmentWhereInput = {
          group: { branchId },
          deletedAt: null,
          status: OPEN_ENROLLMENT,
        };
        await this.recordRemovals(
          enrollFilter,
          newStatus === BranchStatus.CLOSED
            ? BRANCH_CLOSED_REASON
            : BRANCH_ARCHIVED_REASON,
          userId,
        );
        const enrollResult = await this.cascadeEnrollmentStatus(
          enrollFilter,
          EnrollmentStatus.DROPPED,
          reason ?? null,
          userId,
          auditFields,
        );
        results.push({
          entity: 'Enrollment',
          count: enrollResult.count,
          toStatus: 'DROPPED',
        });

        // Xonalar → ARCHIVED
        const roomFilter = {
          branchId,
          deletedAt: null,
          status: { not: RoomStatus.ARCHIVED },
        };
        await this.recordRoomBatchStatusChange(
          roomFilter,
          RoomStatus.ARCHIVED,
          reason,
          userId,
        );
        const roomResult = await this.prisma.room.updateMany({
          where: roomFilter,
          data: { status: RoomStatus.ARCHIVED, ...auditFields },
        });
        results.push({
          entity: 'Room',
          count: roomResult.count,
          toStatus: 'ARCHIVED',
        });
      } else if (newStatus === BranchStatus.INACTIVE) {
        // Guruhlar → PAUSED
        const groupFilter = {
          branchId,
          deletedAt: null,
          statusEnum: GroupStatus.ACTIVE,
        };
        await this.recordGroupBatchStatusChange(
          groupFilter,
          GroupStatus.PAUSED,
          reason,
          userId,
        );
        const groupResult = await this.prisma.group.updateMany({
          where: groupFilter,
          data: { statusEnum: GroupStatus.PAUSED, ...auditFields },
        });
        results.push({
          entity: 'Group',
          count: groupResult.count,
          toStatus: 'PAUSED',
        });
      }
    }

    if (entityType === 'Course') {
      if (newStatus === CourseStatus.ARCHIVED) {
        // Guruhlar → CANCELLED
        const groupFilter = groupsCancelledBy('Course', entityId, newStatus)!;
        await this.recordGroupBatchStatusChange(
          groupFilter,
          GroupStatus.CANCELLED,
          reason,
          userId,
        );
        const groupResult = await this.prisma.group.updateMany({
          where: groupFilter,
          data: {
            statusEnum: GroupStatus.CANCELLED,
            isActive: false,
            ...auditFields,
          },
        });
        results.push({
          entity: 'Group',
          count: groupResult.count,
          toStatus: 'CANCELLED',
        });

        // Enrollmentlar → DROPPED
        const enrollFilter: Prisma.EnrollmentWhereInput = {
          group: { courseId: entityId },
          deletedAt: null,
          status: OPEN_ENROLLMENT,
        };
        await this.recordRemovals(enrollFilter, COURSE_ARCHIVED_REASON, userId);
        const enrollResult = await this.cascadeEnrollmentStatus(
          enrollFilter,
          EnrollmentStatus.DROPPED,
          reason ?? null,
          userId,
          auditFields,
        );
        results.push({
          entity: 'Enrollment',
          count: enrollResult.count,
          toStatus: 'DROPPED',
        });
      }
    }

    if (entityType === 'Student') {
      const studentId = Number(entityId);

      if (newStatus === 'FROZEN') {
        const filter = {
          studentId,
          deletedAt: null,
          status: EnrollmentStatus.ACTIVE,
        };
        await this.recordGroupHistoryForStudentCascade(
          studentId,
          filter,
          'OQUVCHI_MUZLATILDI',
          userId,
        );
        const enrollResult = await this.cascadeEnrollmentStatus(
          filter,
          EnrollmentStatus.FROZEN,
          reason ?? null,
          userId,
          auditFields,
        );
        results.push({
          entity: 'Enrollment',
          count: enrollResult.count,
          toStatus: 'FROZEN',
        });
      }

      if (newStatus === 'ACTIVE') {
        const filter = {
          studentId,
          deletedAt: null,
          status: EnrollmentStatus.FROZEN,
          group: { deletedAt: null, statusEnum: GroupStatus.ACTIVE },
        };
        await this.recordGroupHistoryForStudentCascade(
          studentId,
          filter,
          'OQUVCHI_QAYTDI',
          userId,
          'add',
        );
        const enrollResult = await this.cascadeEnrollmentStatus(
          filter,
          EnrollmentStatus.ACTIVE,
          reason ?? null,
          userId,
          auditFields,
        );
        results.push({
          entity: 'Enrollment',
          count: enrollResult.count,
          toStatus: 'ACTIVE',
        });
      }

      if (newStatus === 'ARCHIVED' || newStatus === 'EXPELLED') {
        const action =
          newStatus === 'EXPELLED'
            ? 'OQUVCHI_CHETLATILDI'
            : 'OQUVCHI_OCHIRILDI';
        const filter = {
          studentId,
          deletedAt: null,
          status: {
            in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.FROZEN],
          } as any,
        };
        // Read before the flip, while `filter` still selects them; their
        // group rows are written after it, once each month's money is known.
        const leaving = await this.loadStudentCascadeEnrollments(filter);
        // An expulsion is the student's own departure unless a CEO or branch
        // director chose otherwise (contract 6.2, ADR-0043). An archive
        // removes a record made by mistake and keeps the old rule.
        const expelled = newStatus === 'EXPELLED';
        const enrollResult = await this.cascadeEnrollmentStatus(
          filter,
          EnrollmentStatus.DROPPED,
          reason ?? null,
          userId,
          auditFields,
          undefined,
          expelled
            ? (options.departurePolicy ?? DEFAULT_DEPARTURE_POLICY)
            : undefined,
        );
        const money = new Map<string, string>();
        for (const e of expelled ? leaving : []) {
          const note = departureMoneyNote(
            enrollResult.departures.get(e.id) ?? null,
          );
          if (!note) continue;
          money.set(e.id, note);
          options.moneyNotes?.push({ groupName: e.group.name, note });
        }
        await this.writeGroupHistoryForStudentCascade(
          studentId,
          leaving,
          action,
          userId,
          'remove',
          money,
        );
        results.push({
          entity: 'Enrollment',
          count: enrollResult.count,
          toStatus: 'DROPPED',
        });
      }
    }

    return results.filter((r) => r.count > 0);
  }
}
