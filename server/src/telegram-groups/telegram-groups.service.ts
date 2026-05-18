import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramGroupStatus } from '@prisma/client';
import { EntityHistoryService } from '../common/entity-history';

@Injectable()
export class TelegramGroupsService {
  private readonly logger = new Logger(TelegramGroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entityHistory: EntityHistoryService,
  ) {}

  /**
   * Called from the `my_chat_member` handler when the bot is added to a group.
   * Idempotent: a re-add of an already-known chat reactivates/refreshes the row.
   */
  async onBotAddedToGroup(input: {
    chatId: bigint;
    title: string;
    addedByTelegramUserId?: bigint | null;
  }) {
    return this.prisma.telegramGroup.upsert({
      where: { chatId: input.chatId },
      create: {
        chatId: input.chatId,
        title: input.title,
        status: TelegramGroupStatus.PENDING,
        addedByTelegramUserId: input.addedByTelegramUserId ?? null,
        isActive: true,
      },
      update: {
        title: input.title,
        // If the group was previously rejected or soft-deleted, re-adding
        // the bot reopens it as pending so an admin can decide again.
        status: TelegramGroupStatus.PENDING,
        addedByTelegramUserId: input.addedByTelegramUserId ?? null,
        isActive: true,
        deletedAt: null,
        approvedById: null,
        approvedAt: null,
        companyId: null,
        branchId: null,
      },
    });
  }

  /**
   * Called from the `my_chat_member` handler when the bot is removed from a group.
   */
  async onBotRemovedFromGroup(chatId: bigint) {
    const group = await this.prisma.telegramGroup.findUnique({
      where: { chatId },
    });
    if (!group) return;
    await this.prisma.telegramGroup.update({
      where: { id: group.id },
      data: { isActive: false },
    });
  }

  async findByChatId(chatId: bigint) {
    return this.prisma.telegramGroup.findUnique({ where: { chatId } });
  }

  /**
   * Pending list — visible to any CEO/BD so they can pick the group that
   * belongs to their company. First approver wins.
   */
  async listPending() {
    return this.prisma.telegramGroup.findMany({
      where: {
        status: TelegramGroupStatus.PENDING,
        deletedAt: null,
      },
      orderBy: { addedAt: 'desc' },
    });
  }

  async listForCompany(companyId: number) {
    return this.prisma.telegramGroup.findMany({
      where: {
        companyId,
        status: TelegramGroupStatus.APPROVED,
        deletedAt: null,
      },
      orderBy: { approvedAt: 'desc' },
      include: {
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Approve a pending group and bind it to the caller's company.
   * Used by the admin panel UI and by the interim CLI script.
   */
  async approve(
    id: string,
    caller: { id: number; companyId: number; roles: string[] },
    branchId?: number | null,
  ) {
    const isAllowed =
      caller.roles.includes('CEO') || caller.roles.includes('Branch Director');
    if (!isAllowed) {
      throw new ForbiddenException(
        "Faqat CEO yoki Filial Direktori guruhni tasdiqlay oladi",
      );
    }

    const group = await this.prisma.telegramGroup.findUnique({ where: { id } });
    if (!group || group.deletedAt) {
      throw new NotFoundException('Guruh topilmadi');
    }
    if (group.status === TelegramGroupStatus.APPROVED) {
      throw new BadRequestException(
        `Bu guruh allaqachon tasdiqlangan (companyId=${group.companyId})`,
      );
    }

    const updated = await this.prisma.telegramGroup.update({
      where: { id },
      data: {
        status: TelegramGroupStatus.APPROVED,
        companyId: caller.companyId,
        branchId: branchId ?? null,
        approvedById: caller.id,
        approvedAt: new Date(),
        isActive: true,
      },
      include: {
        approvedBy: { select: { firstName: true, lastName: true } },
        company: { select: { name: true } },
      },
    });

    await this.entityHistory
      .recordCreate({
        entityType: 'TelegramGroup',
        entityId: updated.id,
        newValues: {
          action: 'APPROVED',
          chatId: updated.chatId.toString(),
          title: updated.title,
          companyId: updated.companyId,
          branchId: updated.branchId,
        },
        changedById: caller.id,
        companyId: caller.companyId,
      })
      .catch((err) =>
        this.logger.warn(`approve audit failed: ${err?.message}`),
      );

    return updated;
  }

  async reject(id: string, caller: { id?: number; companyId?: number; roles: string[] }) {
    const isAllowed =
      caller.roles.includes('CEO') || caller.roles.includes('Branch Director');
    if (!isAllowed) {
      throw new ForbiddenException("Sizga ruxsat yo'q");
    }
    const group = await this.prisma.telegramGroup.findUnique({ where: { id } });
    if (!group || group.deletedAt) throw new NotFoundException('Guruh topilmadi');
    if (group.status === TelegramGroupStatus.APPROVED) {
      throw new BadRequestException(
        "Tasdiqlangan guruhni rad etib bo'lmaydi; uning o'rniga /unlink yoki DELETE ishlating",
      );
    }
    const updated = await this.prisma.telegramGroup.update({
      where: { id },
      data: { status: TelegramGroupStatus.REJECTED, deletedAt: new Date(), isActive: false },
    });

    if (caller.id) {
      await this.entityHistory
        .recordCreate({
          entityType: 'TelegramGroup',
          entityId: updated.id,
          newValues: {
            action: 'REJECTED',
            chatId: updated.chatId.toString(),
            title: updated.title,
          },
          changedById: caller.id,
          companyId: caller.companyId,
        })
        .catch((err) =>
          this.logger.warn(`reject audit failed: ${err?.message}`),
        );
    }

    return updated;
  }

  /**
   * Soft-delete an approved group. Caller scope:
   *   - From the admin panel (HTTP): requires CEO of the same company.
   *   - From inside the group via /unlink: caller is a Telegram group admin —
   *     no ERP role check (the chat itself is the ACL).
   */
  async unlinkApproved(id: string, caller: { companyId: number; roles: string[] }) {
    const group = await this.prisma.telegramGroup.findUnique({ where: { id } });
    if (!group || group.deletedAt) throw new NotFoundException('Guruh topilmadi');
    if (group.companyId !== caller.companyId) {
      throw new ForbiddenException("Bu guruh sizning kompaniyangizga tegishli emas");
    }
    if (!caller.roles.includes('CEO')) {
      throw new ForbiddenException('Faqat CEO botni guruhdan uzishi mumkin');
    }
    return this.prisma.telegramGroup.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async unlinkFromGroup(id: string) {
    await this.prisma.telegramGroup.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async deactivate(id: string) {
    await this.prisma.telegramGroup.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
