import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import { TelegramGroupsService } from './telegram-groups.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { TelegramGroupAnnouncementService } from './telegram-group-announcement.service';
import { announceApproval } from './telegram-admin-bot-registrar';
import { ApproveGroupDto } from './dto/approve-group.dto';
import { UpdateTelegramGroupDto } from './dto/update-telegram-group.dto';
import { AnnounceFeatureDto } from './dto/announce-feature.dto';

@Controller('telegram-groups')
@UseGuards(RolesGuard)
export class TelegramGroupsController {
  private readonly logger = new Logger(TelegramGroupsController.name);

  constructor(
    private readonly groupsService: TelegramGroupsService,
    private readonly adminBot: TelegramAdminBotService,
    private readonly announcementService: TelegramGroupAnnouncementService,
  ) {}

  /**
   * List pending groups so CEO/BD can pick the one that belongs to them.
   * Pending list is intentionally cross-company — the bot does not know
   * which company a fresh group belongs to until someone claims it.
   * First approver wins.
   */
  @Get('pending')
  @Roles('CEO', 'Branch Director')
  async listPending() {
    const groups = await this.groupsService.listPending();
    return groups.map((g) => ({
      id: g.id,
      chatId: g.chatId.toString(),
      title: g.title,
      addedAt: g.addedAt.toISOString(),
      addedByTelegramUserId: g.addedByTelegramUserId?.toString() ?? null,
    }));
  }

  @Get()
  @Roles('CEO', 'Branch Director', 'Administrator')
  async list(@CurrentUser() user: { companyId: number }) {
    const groups = await this.groupsService.listForCompany(user.companyId);
    return groups.map((g) => ({
      id: g.id,
      chatId: g.chatId.toString(),
      title: g.title,
      branch: g.branch,
      // Without this the settings table cannot tell an org-wide group from one
      // nobody has assigned — the very confusion the flag exists to remove.
      receivesAllBranches: g.receivesAllBranches,
      isActive: g.isActive,
      approvedBy: g.approvedBy,
      approvedAt: g.approvedAt?.toISOString() ?? null,
      lastDailyReportAt: g.lastDailyReportAt?.toISOString() ?? null,
    }));
  }

  @Post(':id/approve')
  @Roles('CEO', 'Branch Director')
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveGroupDto,
    @CurrentUser() user: { id: number; companyId: number; roles: string[] },
  ) {
    const updated = await this.groupsService.approve(
      id,
      user,
      dto.branchId,
      dto.receivesAllBranches ?? false,
    );

    // Tell the group it has been approved (best-effort — don't fail the API
    // call if the bot isn't running locally).
    const bot = this.adminBot.getBot();
    if (bot && updated.company) {
      const approverName = updated.approvedBy
        ? `${updated.approvedBy.firstName} ${updated.approvedBy.lastName}`
        : 'admin';
      announceApproval(
        bot,
        updated.chatId,
        updated.company.name,
        approverName,
      ).catch((err) =>
        this.logger.warn(
          `Could not announce approval in chat ${updated.chatId}: ${err?.message}`,
        ),
      );
    }

    return {
      id: updated.id,
      chatId: updated.chatId.toString(),
      title: updated.title,
      status: updated.status,
      companyId: updated.companyId,
      branchId: updated.branchId,
      receivesAllBranches: updated.receivesAllBranches,
      approvedAt: updated.approvedAt?.toISOString() ?? null,
    };
  }

  /**
   * Repoint an already-approved group at a branch, or at all of them.
   *
   * Not part of `approve` because this is the operation that FIXES a group that
   * was approved before a branch was required — two production groups are in
   * exactly that state and would otherwise need a database script.
   */
  @Patch(':id')
  @Roles('CEO', 'Branch Director')
  async updateScope(
    @Param('id') id: string,
    @Body() dto: UpdateTelegramGroupDto,
    @CurrentUser() user: { id: number; companyId: number; roles: string[] },
  ) {
    return this.groupsService.updateScope(id, user, dto);
  }

  @Post(':id/reject')
  @Roles('CEO', 'Branch Director')
  async reject(
    @Param('id') id: string,
    @CurrentUser() user: { id: number; companyId: number; roles: string[] },
  ) {
    await this.groupsService.reject(id, user);
    return { message: 'Guruh rad etildi' };
  }

  @Delete(':id')
  @Roles('CEO')
  async unlink(
    @Param('id') id: string,
    @CurrentUser() user: { companyId: number; roles: string[] },
  ) {
    await this.groupsService.unlinkApproved(id, user);
    return { message: 'Guruh tizimdan uzildi' };
  }

  /**
   * Send a feature announcement to all approved Telegram groups. CEO-only —
   * these are global product comms.
   */
  @Post('announce')
  @Roles('CEO')
  async announce(
    @Body() dto: AnnounceFeatureDto,
    @CurrentUser() user: { id: number; companyId: number },
  ) {
    return this.announcementService.broadcast(dto, user);
  }
}
