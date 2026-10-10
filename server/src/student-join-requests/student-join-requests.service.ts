import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { Prisma, type StudentJoinRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';
import { StudentLeadOriginService } from '../common/student-origin';
import { assertCallerInBranch } from '../common/auth/branch-scope';
import { loadContactPhone } from '../balance-notices/load-transfer-state';
import { registerStudentFromTelegram } from '../telegram/scenes/student-registration-flow';
import {
  addDaysToDateStr,
  tashkentDateStr,
  tashkentDayStartUtc,
} from '../common/date/tashkent';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';
import { HOLIDAY_LOOKAHEAD_DAYS } from '../unmarked-lessons/reask-holidays';
import { isEnrollableGroupStatus } from '../groups/shared/enrollable-statuses';
import { nextWorkingDay, taskDueAt } from '../tasks/lesson-task';
import {
  closeJoinRequestTask,
  createJoinRequestTask,
  joinRequestTaskTitle,
  type JoinTaskCloseReason,
} from '../tasks/join-request-task';
import { TASK_EVENTS, type TaskAssignedPayload } from '../tasks/task-events';
import {
  JOIN_REQUEST_CLOSED,
  JOIN_REQUEST_MESSAGE,
  type JoinRequestClosedEvent,
  type JoinRequestMessageEvent,
} from './join-request-events';
import {
  CHAT_TAKEN_REPLY,
  GROUP_CLOSED_REPLY,
  PHONE_TAKEN_REPLY,
  joinRequestApprovedText,
  joinRequestExpiredText,
  joinRequestReceivedText,
  joinRequestRejectedText,
  scheduleText,
} from './join-request-texts';
import { loadJoinRequestView, type JoinRequestView } from './join-request-view';

export interface JoinRequestCreateInput {
  branchId: number;
  groupId: string;
  chatId: string;
  telegramUsername: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  photo: string;
}

export type JoinRequestCreateOutcome =
  | { kind: 'created'; requestId: string; text: string }
  | { kind: 'refused'; message: string };

/** What the bot scene needs from this service. */
export type JoinRequestGateway = Pick<
  StudentJoinRequestsService,
  'create' | 'pendingForChat'
>;

export const GROUP_SELECT = {
  id: true,
  name: true,
  companyId: true,
  branchId: true,
  statusEnum: true,
  deletedAt: true,
  days: true,
  exactDays: true,
  lessonStartTime: true,
  lessonEndTime: true,
  branch: { select: { status: true, deletedAt: true } },
  teachers: {
    select: { teacher: { select: { firstName: true, lastName: true } } },
    take: 1,
  },
} satisfies Prisma.GroupSelect;
export type JoinGroup = Prisma.GroupGetPayload<{ select: typeof GROUP_SELECT }>;

/** The group, alive, in a live branch, and taking students. */
export function groupTakesStudents(g: JoinGroup): boolean {
  return (
    g.deletedAt === null &&
    isEnrollableGroupStatus(g.statusEnum) &&
    g.branch.status === 'ACTIVE' &&
    g.branch.deletedAt === null
  );
}

export function teacherNameOf(g: JoinGroup): string | null {
  const t = g.teachers[0]?.teacher;
  return t ? `${t.firstName} ${t.lastName}` : null;
}

const EXPIRE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** A run closes at most this many; the next day takes the rest. */
const EXPIRE_BATCH = 200;

export const ALREADY_DECIDED = "Bu so'rov allaqachon ko'rib chiqilgan";
const GROUP_NOT_ENROLLABLE =
  "Bu guruhga yozib bo'lmaydi — boshqa guruhni tanlang";
const BRANCH_NOT_ACTIVE = "Filial faol emas — so'rovni tasdiqlab bo'lmaydi";

export interface JoinRequestCaller {
  id: number;
  companyId: number;
  /** Role names, as `PermissionGuard` read them from the database. */
  roles: string[];
}

/**
 * The «Dars bo'ldimi?» rule (ADR-0054): the administrator who took the task
 * decides; the CEO and a Branch Director always may.
 */
export async function assertMayDecide(
  db: Pick<PrismaService, 'user'>,
  claimedById: number | null,
  caller: JoinRequestCaller,
): Promise<void> {
  if (claimedById === null || claimedById === caller.id) return;
  if (caller.roles.includes('CEO') || caller.roles.includes('Branch Director'))
    return;
  const holder = await db.user.findUnique({
    where: { id: claimedById },
    select: { firstName: true, lastName: true },
  });
  throw new ConflictException(
    holder
      ? `Bu so'rovni ${holder.firstName} ${holder.lastName} ko'rib chiqmoqda`
      : "Bu so'rovni boshqa administrator ko'rib chiqmoqda",
  );
}

/** A request that is being closed: what is cleaned up after the commit. */
interface Closing {
  companyId: number;
  taskId: string | null;
  photo: string | null;
}

/**
 * Bot sign-ups as requests (ADR-0080). A request writes nothing but itself and
 * its task; the card, the enrollment, the charge, the account and the lead
 * come with the approval.
 */
@Injectable()
export class StudentJoinRequestsService {
  private readonly logger = new Logger(StudentJoinRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
    private readonly history: EntityHistoryService,
    private readonly leadOrigin: StudentLeadOriginService,
    private readonly events: EventEmitter2,
  ) {}

  /** The chat's waiting request, for the bot's «you already asked» notice. */
  async pendingForChat(chatId: string): Promise<{ groupName: string } | null> {
    const row = await this.prisma.studentJoinRequest.findFirst({
      where: { chatId, status: 'PENDING' },
      select: { groupId: true },
    });
    if (!row) return null;
    const group = await this.prisma.group.findUnique({
      where: { id: row.groupId },
      select: { name: true },
    });
    return { groupName: group?.name ?? '—' };
  }

  async create(
    input: JoinRequestCreateInput,
  ): Promise<JoinRequestCreateOutcome> {
    const [phoneCard, chatCard, group] = await Promise.all([
      this.prisma.student.findFirst({
        where: { phone: input.phone, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.student.findFirst({
        where: { telegramChatId: input.chatId, deletedAt: null },
        select: { id: true },
      }),
      this.loadGroup(input.groupId),
    ]);
    if (phoneCard) return { kind: 'refused', message: PHONE_TAKEN_REPLY };
    if (chatCard) return { kind: 'refused', message: CHAT_TAKEN_REPLY };
    if (
      !group ||
      group.branchId !== input.branchId ||
      !groupTakesStudents(group)
    ) {
      return { kind: 'refused', message: GROUP_CLOSED_REPLY };
    }

    const now = new Date();
    const dueAt = taskDueAt(
      nextWorkingDay(
        tashkentDateStr(now),
        await this.branchHolidays(input.branchId, now),
      ),
    );
    const title = joinRequestTaskTitle({
      firstName: input.firstName,
      lastName: input.lastName,
      groupName: group.name,
    });

    const { requestId, task, replaced } = await this.prisma.$transaction(
      async (tx) => {
        // One open request per chat (spec D9): the new one replaces it.
        const previous = await tx.studentJoinRequest.findFirst({
          where: { chatId: input.chatId, status: 'PENDING' },
          select: { id: true, companyId: true, taskId: true, photo: true },
        });
        if (previous) {
          await tx.studentJoinRequest.update({
            where: { id: previous.id },
            data: { status: 'REPLACED', decidedAt: now, photo: null },
          });
          await closeJoinRequestTask(
            tx,
            previous.taskId,
            null,
            'JOIN_REPLACED',
          );
        }
        const request = await tx.studentJoinRequest.create({
          data: {
            companyId: group.companyId,
            branchId: input.branchId,
            groupId: group.id,
            chatId: input.chatId,
            telegramUsername: input.telegramUsername,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            photo: input.photo,
          },
          select: { id: true },
        });
        const made = await createJoinRequestTask(tx, {
          companyId: group.companyId,
          branchId: input.branchId,
          groupId: group.id,
          requestId: request.id,
          title,
          dueAt,
        });
        if (made) {
          await tx.studentJoinRequest.update({
            where: { id: request.id },
            data: { taskId: made.id },
          });
        }
        return { requestId: request.id, task: made, replaced: previous };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (replaced) await this.afterClose(replaced);
    if (task) {
      this.events.emit(TASK_EVENTS.ASSIGNED, {
        task: task.eventTask,
        actorId: null,
        userIds: task.assigneeIds,
        created: true,
      } satisfies TaskAssignedPayload);
    }
    return {
      kind: 'created',
      requestId,
      text: joinRequestReceivedText({
        firstName: input.firstName,
        groupName: group.name,
        teacherName: teacherNameOf(group),
        schedule: scheduleText(group),
      }),
    };
  }

  async getByTask(
    taskId: string,
    caller: JoinRequestCaller,
  ): Promise<JoinRequestView> {
    const request = await this.prisma.studentJoinRequest.findFirst({
      where: { taskId, companyId: caller.companyId },
    });
    if (!request) throw new NotFoundException("So'rov topilmadi");
    await assertCallerInBranch(this.prisma, caller.id, request.branchId);
    return loadJoinRequestView(this.prisma, request);
  }

  async approve(
    id: string,
    groupId: string | undefined,
    caller: JoinRequestCaller,
  ): Promise<{ status: 'APPROVED'; studentId: number; delivered: boolean }> {
    const request = await this.loadForDecision(id, caller);
    const group = await this.loadGroup(groupId ?? request.groupId);
    if (
      !group ||
      group.branchId !== request.branchId ||
      group.deletedAt !== null ||
      !isEnrollableGroupStatus(group.statusEnum)
    ) {
      throw new BadRequestException(GROUP_NOT_ENROLLABLE);
    }
    if (group.branch.status !== 'ACTIVE' || group.branch.deletedAt !== null) {
      throw new BadRequestException(BRANCH_NOT_ACTIVE);
    }
    const [phoneCard, chatCard] = await Promise.all([
      this.prisma.student.findFirst({
        where: { phone: request.phone, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.student.findFirst({
        where: { telegramChatId: request.chatId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (phoneCard) {
      throw new BadRequestException(
        `Bu raqam #${phoneCard.id} o'quvchida bor — so'rovni rad eting yoki o'sha kartani oching`,
      );
    }
    if (chatCard) {
      throw new BadRequestException(
        `Bu Telegram #${chatCard.id} o'quvchiga bog'langan`,
      );
    }

    const now = new Date();
    let studentId = 0;
    let plainPassword: string;
    try {
      ({ plainPassword } = await registerStudentFromTelegram(
        this.prisma,
        this.history,
        this.leadOrigin,
        {
          firstName: request.firstName,
          lastName: request.lastName,
          phone: request.phone,
          photo: request.photo,
          branchId: request.branchId,
          groupId: group.id,
          groupName: group.name,
        },
        request.chatId,
        this.events,
        {
          actorId: caller.id,
          // Taken in the card's own transaction: a second approval finds it
          // decided and its card is rolled back.
          inTx: async (tx, newStudentId) => {
            studentId = newStudentId;
            const { count } = await tx.studentJoinRequest.updateMany({
              where: { id: request.id, status: 'PENDING' },
              data: {
                status: 'APPROVED',
                decidedById: caller.id,
                decidedAt: now,
                approvedGroupId: group.id,
                studentId: newStudentId,
              },
            });
            if (count === 0) throw new ConflictException(ALREADY_DECIDED);
            await closeJoinRequestTask(
              tx,
              request.taskId,
              caller.id,
              'JOIN_APPROVED',
            );
          },
        },
      ));
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException("Bu ma'lumotlar allaqachon tizimda bor");
      }
      throw error;
    }

    // The card keeps the photo; only the bell rows close.
    await this.afterClose({ ...request, photo: null });
    const delivered = await this.sendToPerson({
      chatId: request.chatId,
      photo: request.photo,
      text: joinRequestApprovedText({
        firstName: request.firstName,
        groupName: group.name,
        teacherName: teacherNameOf(group),
        schedule: scheduleText(group),
        phone: request.phone,
        password: plainPassword,
      }),
    });
    return { status: 'APPROVED', studentId, delivered };
  }

  async reject(
    id: string,
    reason: string,
    caller: JoinRequestCaller,
  ): Promise<{ status: 'REJECTED' }> {
    const request = await this.loadForDecision(id, caller);
    if (!(await this.closeRequest(request, 'REJECTED', caller.id, reason))) {
      throw new ConflictException(ALREADY_DECIDED);
    }
    await this.tellClosed(request, joinRequestRejectedText);
    return { status: 'REJECTED' };
  }

  /**
   * Day 7 (spec §6.3): a request nobody decided closes and the person is
   * told. Never approved by silence. 09:00 Tashkent, Sundays included.
   */
  @Cron('0 0 9 * * *', { timeZone: 'Asia/Tashkent' })
  async expireOld(now: Date = new Date()): Promise<number> {
    const rows = await this.prisma.studentJoinRequest.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: new Date(now.getTime() - EXPIRE_AFTER_MS) },
      },
      orderBy: { createdAt: 'asc' },
      take: EXPIRE_BATCH,
    });
    let closed = 0;
    for (const request of rows) {
      try {
        if (!(await this.closeRequest(request, 'EXPIRED', null, null))) {
          continue;
        }
        closed++;
        await this.tellClosed(request, joinRequestExpiredText);
      } catch (error) {
        this.logger.error(
          `So'rov ${request.id} yopilmadi: ${(error as Error).message}`,
        );
      }
    }
    if (closed > 0) {
      this.logger.log(`Muddati o'tgan so'rovlar yopildi: ${closed}`);
    }
    return closed;
  }

  // ---------- shared ----------

  protected loadGroup(id: string): Promise<JoinGroup | null> {
    return this.prisma.group.findFirst({ where: { id }, select: GROUP_SELECT });
  }

  private async loadForDecision(
    id: string,
    caller: JoinRequestCaller,
  ): Promise<StudentJoinRequest> {
    const request = await this.prisma.studentJoinRequest.findFirst({
      where: { id, companyId: caller.companyId },
    });
    if (!request) throw new NotFoundException("So'rov topilmadi");
    await assertCallerInBranch(this.prisma, caller.id, request.branchId);
    if (request.status !== 'PENDING') {
      throw new ConflictException(ALREADY_DECIDED);
    }
    if (request.taskId) {
      const task = await this.prisma.task.findUnique({
        where: { id: request.taskId },
        select: { claimedById: true },
      });
      await assertMayDecide(this.prisma, task?.claimedById ?? null, caller);
    }
    return request;
  }

  /** REJECTED or EXPIRED, with the task closed; false when it was decided meanwhile. */
  private async closeRequest(
    request: StudentJoinRequest,
    status: 'REJECTED' | 'EXPIRED',
    actorId: number | null,
    reason: string | null,
  ): Promise<boolean> {
    const closeReason: JoinTaskCloseReason =
      status === 'REJECTED' ? 'JOIN_REJECTED' : 'JOIN_EXPIRED';
    const now = new Date();
    const closed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.studentJoinRequest.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: {
          status,
          decidedById: actorId,
          decidedAt: now,
          rejectReason: reason,
          photo: null,
        },
      });
      if (count === 0) return false;
      await closeJoinRequestTask(tx, request.taskId, actorId, closeReason);
      return true;
    });
    if (closed) await this.afterClose(request);
    return closed;
  }

  /** The rejection or expiry message, with the branch's phone. */
  private async tellClosed(
    request: StudentJoinRequest,
    text: (p: {
      firstName: string;
      groupName: string;
      phone: string | null;
    }) => string,
  ): Promise<void> {
    const [group, phone] = await Promise.all([
      this.prisma.group.findUnique({
        where: { id: request.groupId },
        select: { name: true },
      }),
      loadContactPhone(this.prisma, request.branchId, request.companyId),
    ]);
    await this.sendToPerson({
      chatId: request.chatId,
      photo: null,
      text: text({
        firstName: request.firstName,
        groupName: group?.name ?? '—',
        phone,
      }),
    });
  }

  /** True when `JoinRequestNotifier` delivered it; no bot or a failure is false. */
  private async sendToPerson(
    message: JoinRequestMessageEvent,
  ): Promise<boolean> {
    try {
      const results: unknown[] = await this.events.emitAsync(
        JOIN_REQUEST_MESSAGE,
        message,
      );
      return results.some((r) => r === true);
    } catch (error) {
      this.logger.warn(
        `So'rov xabari yuborilmadi (chat ${message.chatId}): ${(error as Error).message}`,
      );
      return false;
    }
  }

  /** The branch's holidays from today on, for the task's due day. */
  private branchHolidays(branchId: number, now: Date): Promise<Set<string>> {
    const today = tashkentDateStr(now);
    return buildHolidayDateSet(
      this.prisma,
      tashkentDayStartUtc(today),
      tashkentDayStartUtc(addDaysToDateStr(today, HOLIDAY_LOOKAHEAD_DAYS)),
      branchId,
    );
  }

  /** After a request closed: its photo goes, its bell rows close. */
  protected async afterClose(r: Closing): Promise<void> {
    if (r.photo) await this.upload.deleteFile(r.photo);
    if (r.taskId) {
      this.events.emit(JOIN_REQUEST_CLOSED, {
        companyId: r.companyId,
        taskId: r.taskId,
      } satisfies JoinRequestClosedEvent);
    }
  }
}
