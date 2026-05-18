import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { TelegramGroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { EntityHistoryService } from '../common/entity-history';
import {
  ANNOUNCEMENT_TEMPLATES,
  AnnouncementTemplateKey,
} from './constants';
import { AnnounceFeatureDto } from './dto/announce-feature.dto';

export interface BroadcastResult {
  preview: string;
  recipientCount: number;
  sentCount: number;
  dryRun: boolean;
}

@Injectable()
export class TelegramGroupAnnouncementService {
  private readonly logger = new Logger(TelegramGroupAnnouncementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminBot: TelegramAdminBotService,
    private readonly entityHistory: EntityHistoryService,
  ) {}

  async broadcast(
    dto: AnnounceFeatureDto,
    caller: { id: number; companyId: number },
  ): Promise<BroadcastResult> {
    if (!dto.templateKey && !dto.customMessage) {
      throw new BadRequestException(
        "Shablon yoki maxsus matn kiritilishi shart",
      );
    }
    if (dto.templateKey && dto.customMessage) {
      throw new BadRequestException(
        "Faqat shablon yoki maxsus matn — ikkalasi emas",
      );
    }

    const message = dto.templateKey
      ? this.renderTemplate(dto.templateKey, dto.variables ?? {})
      : dto.customMessage!;

    // Find all approved active groups across all companies — feature
    // announcements are global product comms by design.
    const groups = await this.prisma.telegramGroup.findMany({
      where: {
        status: TelegramGroupStatus.APPROVED,
        isActive: true,
        deletedAt: null,
      },
    });

    if (dto.dryRun) {
      return {
        preview: message,
        recipientCount: groups.length,
        sentCount: 0,
        dryRun: true,
      };
    }

    const bot = this.adminBot.getBot();
    if (!bot) {
      throw new BadRequestException(
        "Admin bot ishga tushmagan — TELEGRAM_ADMIN_BOT_TOKEN tekshirilsin",
      );
    }

    let sent = 0;
    for (const g of groups) {
      try {
        await bot.telegram.sendMessage(g.chatId.toString(), message, {
          parse_mode: 'HTML',
        });
        sent += 1;
      } catch (err: any) {
        const code = err?.response?.error_code ?? err?.code;
        if (code === 403) {
          await this.prisma.telegramGroup
            .update({ where: { id: g.id }, data: { isActive: false } })
            .catch(() => undefined);
        }
        this.logger.warn(
          `Announcement send failed for chat ${g.chatId}: ${err?.message ?? err}`,
        );
      }
    }

    // Audit trail
    await this.entityHistory
      .recordCreate({
        entityType: 'Announcement',
        entityId: `ann-${Date.now()}-${caller.id}`,
        newValues: {
          templateKey: dto.templateKey ?? null,
          customMessage: dto.customMessage ?? null,
          message,
          recipientCount: groups.length,
          sentCount: sent,
        },
        changedById: caller.id,
        companyId: caller.companyId,
      })
      .catch((err) =>
        this.logger.warn(`Announcement audit log failed: ${err?.message}`),
      );

    return {
      preview: message,
      recipientCount: groups.length,
      sentCount: sent,
      dryRun: false,
    };
  }

  /**
   * Render a template by substituting {{varName}} placeholders with values
   * from the variables map. Missing variables fall back to a visible
   * "[?varName?]" so authors notice them in dryRun preview.
   */
  private renderTemplate(
    key: AnnouncementTemplateKey,
    variables: Record<string, string>,
  ): string {
    const template = ANNOUNCEMENT_TEMPLATES[key];
    return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
      const value = variables[name];
      return value !== undefined ? this.escapeHtml(value) : `[?${name}?]`;
    });
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
