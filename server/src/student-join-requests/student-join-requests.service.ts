import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import {
  addDaysToDateStr,
  tashkentDateStr,
  tashkentDayStartUtc,
} from '../common/date/tashkent';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';
import { HOLIDAY_LOOKAHEAD_DAYS } from '../unmarked-lessons/reask-holidays';
import { nextWorkingDay, taskDueAt } from '../tasks/lesson-task';
import {
  closeJoinRequestTask,
  createJoinRequestTask,
  joinRequestTaskTitle,
} from '../tasks/join-request-task';
import { TASK_EVENTS, type TaskAssignedPayload } from '../tasks/task-events';
import {
  CHAT_TAKEN_REPLY,
  GROUP_CLOSED_REPLY,
  PHONE_TAKEN_REPLY,
  joinRequestReceivedText,
  scheduleText,
} from './join-request-texts';
import {
  closeAfterCommit,
  groupTakesStudents,
  loadJoinGroup,
  teacherNameOf,
} from './join-request-shared';

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

/**
 * Bot sign-ups as requests (ADR-0080). A request writes nothing but itself and
 * its task; the card, the enrollment, the charge, the account and the lead
 * come with the approval (`JoinRequestDecisionsService`).
 */
@Injectable()
export class StudentJoinRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
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
      loadJoinGroup(this.prisma, input.groupId),
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

    if (replaced) await closeAfterCommit(this.upload, this.events, replaced);
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
}
