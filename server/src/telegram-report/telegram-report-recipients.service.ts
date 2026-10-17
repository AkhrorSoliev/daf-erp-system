import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Prisma,
  UserStatus,
  type TelegramReportRecipient,
  type TelegramReportSection,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { signInStaffWhere } from '../common/auth/staff-telegram';
import { staffChatOf } from '../tasks/telegram/task-telegram-view';
import { PersonalReportService } from './personal-report.service';
import { reachOf } from './reach-state';
import type { UpdateRecipientDto } from './dto/telegram-report.dto';

const ENTITY = 'TelegramReportRecipient';
const CEO_ROLE_ID = 1;
const DEFAULT_SECTIONS: TelegramReportSection[] = [
  'STUDENTS',
  'LESSONS',
  'ACTIVE_STUDENTS',
  'ALERTS',
];

/** Plain values for EntityHistory (arrays are skipped there, so join them). */
const historyValues = (r: TelegramReportRecipient) => ({
  userId: r.userId,
  sendTime: r.sendTime,
  layout: r.layout,
  allBranches: r.allBranches,
  branchIds: r.branchIds.join(','),
  sections: r.sections.join(','),
  isActive: r.isActive,
});

@Injectable()
export class TelegramReportRecipientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: EntityHistoryService,
    private readonly reports: PersonalReportService,
  ) {}

  private staffWhere(companyId: number): Prisma.UserWhereInput {
    return {
      companyId,
      ...signInStaffWhere(),
      status: UserStatus.ACTIVE,
      isActive: true,
    };
  }

  private liveBranches(companyId: number) {
    return this.prisma.branch.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ['ACTIVE', 'INACTIVE'] },
      },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
  }

  private async view(
    rows: TelegramReportRecipient[],
    branches: Array<{ id: number }>,
  ) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        telegramDisconnectedAt: true,
      },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return Promise.all(
      rows.map(async (r) => {
        const u = byId.get(r.userId);
        const linked = (await staffChatOf(this.prisma, r.userId)) !== null;
        const disconnectedAt = u?.telegramDisconnectedAt ?? null;
        const allowed = r.allBranches
          ? branches
          : branches.filter((b) => r.branchIds.includes(b.id));
        return {
          id: r.id,
          userId: r.userId,
          name: u ? `${u.firstName} ${u.lastName}` : `#${r.userId}`,
          position: u?.position ?? null,
          sendTime: r.sendTime,
          layout: r.layout,
          allBranches: r.allBranches,
          branchIds: r.branchIds,
          sections: r.sections,
          isActive: r.isActive,
          lastSentDate: r.lastSentDate
            ? r.lastSentDate.toISOString().slice(0, 10)
            : null,
          telegramLinked: linked,
          reach: reachOf({
            linked,
            disconnectedAt,
            lastAttemptOk: r.lastAttemptOk,
          }),
          blockedAt: disconnectedAt ? disconnectedAt.toISOString() : null,
          lastAttempt: r.lastAttemptAt
            ? {
                at: r.lastAttemptAt.toISOString(),
                ok: r.lastAttemptOk === true,
                note: r.lastAttemptNote,
              }
            : null,
          noBranch: allowed.length === 0,
        };
      }),
    );
  }

  private async one(companyId: number, id: number) {
    const row = await this.prisma.telegramReportRecipient.findFirst({
      where: { id, companyId },
    });
    if (!row) throw new NotFoundException('Oluvchi topilmadi');
    return row;
  }

  async list(companyId: number) {
    const [rows, branches] = await Promise.all([
      this.prisma.telegramReportRecipient.findMany({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
      }),
      this.liveBranches(companyId),
    ]);
    return {
      recipients: await this.view(rows, branches),
      branches,
      bot: { active: await this.reports.botActive() },
    };
  }

  async candidates(companyId: number) {
    const taken = await this.prisma.telegramReportRecipient.findMany({
      where: { companyId },
      select: { userId: true },
    });
    const users = await this.prisma.user.findMany({
      where: {
        ...this.staffWhere(companyId),
        id: { notIn: taken.map((t) => t.userId) },
      },
      select: { id: true, firstName: true, lastName: true, position: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return users.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      position: u.position,
    }));
  }

  async create(companyId: number, actorId: number, userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, ...this.staffWhere(companyId) },
      select: {
        mainBranch: true,
        branches: { select: { branchId: true } },
        roles: { select: { roleId: true } },
      },
    });
    if (!user) throw new NotFoundException('Xodim topilmadi');
    if (
      await this.prisma.telegramReportRecipient.findFirst({
        where: { companyId, userId },
      })
    ) {
      throw new ConflictException("Bu xodim ro'yxatda bor");
    }
    const isCeo = user.roles.some((r) => r.roleId === CEO_ROLE_ID);
    const own = [
      ...new Set([user.mainBranch, ...user.branches.map((b) => b.branchId)]),
    ]
      .filter((id): id is number => id !== null)
      .sort((a, b) => a - b);
    let row: TelegramReportRecipient;
    try {
      row = await this.prisma.telegramReportRecipient.create({
        data: {
          companyId,
          userId,
          createdById: actorId,
          sendTime: '21:00',
          layout: 'BY_SECTION',
          allBranches: isCeo,
          branchIds: isCeo ? [] : own,
          sections: DEFAULT_SECTIONS,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException("Bu xodim ro'yxatda bor");
      }
      throw e;
    }
    await this.history.recordCreate({
      entityType: ENTITY,
      entityId: row.id,
      changedById: actorId,
      companyId,
      newValues: historyValues(row),
    });
    return (await this.view([row], await this.liveBranches(companyId)))[0];
  }

  async update(
    companyId: number,
    actorId: number,
    id: number,
    dto: UpdateRecipientDto,
  ) {
    const row = await this.one(companyId, id);
    const branches = await this.liveBranches(companyId);
    if (dto.branchIds?.some((b) => !branches.some((x) => x.id === b))) {
      throw new BadRequestException('Filial topilmadi');
    }
    const data: Prisma.TelegramReportRecipientUpdateInput = { ...dto };
    if (dto.branchIds) {
      data.branchIds = [...new Set(dto.branchIds)].sort((a, b) => a - b);
    }
    if (dto.allBranches === true) data.branchIds = [];
    const updated = await this.prisma.telegramReportRecipient.update({
      where: { id: row.id },
      data,
    });
    await this.history.recordUpdate({
      entityType: ENTITY,
      entityId: row.id,
      changedById: actorId,
      companyId,
      oldValues: historyValues(row),
      newValues: historyValues(updated),
    });
    return (await this.view([updated], branches))[0];
  }

  async remove(companyId: number, actorId: number, id: number) {
    const row = await this.one(companyId, id);
    await this.prisma.telegramReportRecipient.delete({ where: { id: row.id } });
    await this.history.recordDelete({
      entityType: ENTITY,
      entityId: row.id,
      changedById: actorId,
      companyId,
      oldValues: historyValues(row),
    });
    return { message: 'Oluvchi olib tashlandi' };
  }

  /** «Ulanishni tekshirish»: asks Telegram, shows nothing to the staff member. */
  async check(companyId: number, id: number) {
    const row = await this.one(companyId, id);
    return this.reports.probe(row.userId);
  }

  /** The report this recipient would get now, as plain text with real figures. */
  async preview(companyId: number, id: number) {
    const row = await this.one(companyId, id);
    return { text: await this.reports.preview(row) };
  }

  /** «Hozir sinab ko'rish»: sends now, never touches `lastSentDate`. */
  async test(companyId: number, id: number) {
    const row = await this.one(companyId, id);
    const out = await this.reports.deliver(row);
    if (out.ok) return { sent: true as const };
    switch (out.reason) {
      case 'NO_CHAT':
        throw new BadRequestException(
          'Telegram ulanmagan — xodim botda /xodim orqali ulanishi kerak',
        );
      case 'NO_BRANCH':
        throw new BadRequestException('Filial tanlanmagan');
      case 'NO_BOT':
        throw new ServiceUnavailableException('Bot ishlamayapti');
      default:
        throw new BadRequestException('Botga xabar yetmadi');
    }
  }
}
