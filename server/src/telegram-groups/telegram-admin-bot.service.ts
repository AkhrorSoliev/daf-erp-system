import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { TelegramAdminBotRegistrar } from './telegram-admin-bot-registrar';

/**
 * Separate Telegraf instance for the admin/management bot. This bot is added
 * to Telegram groups owned by company admins; it answers slash commands with
 * statistics and posts broadcasts. Kept distinct from the student/teacher
 * registration bot for security isolation: a leaked admin token cannot reach
 * students' DMs and vice versa.
 */
@Injectable()
export class TelegramAdminBotService implements OnModuleInit, OnModuleDestroy {
  private bot: Telegraf | null = null;
  private readonly logger = new Logger(TelegramAdminBotService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly registrar: TelegramAdminBotRegistrar,
  ) {}

  async onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_ADMIN_BOT_TOKEN');
    if (!token) {
      this.logger.warn(
        'TELEGRAM_ADMIN_BOT_TOKEN mavjud emas — admin bot ishga tushmaydi',
      );
      return;
    }

    this.bot = new Telegraf(token);
    this.registrar.register(this.bot);

    const webhookUrl = this.configService.get<string>(
      'TELEGRAM_ADMIN_BOT_WEBHOOK_URL',
    );
    if (webhookUrl) {
      await this.bot.telegram.setWebhook(webhookUrl);
      this.logger.log(`Admin bot webhook o'rnatildi: ${webhookUrl}`);
    } else {
      this.bot.launch().catch((err) => {
        this.logger.error('Admin bot ishga tushirishda xatolik:', err.message);
      });
      this.logger.log('Admin bot polling rejimida ishga tushdi');
    }
  }

  onModuleDestroy() {
    if (this.bot) {
      this.bot.stop('NestJS shutdown');
    }
  }

  /**
   * Used by broadcast/announcement services to send messages to a group.
   * Returns the underlying Telegraf instance (null if bot didn't start).
   */
  getBot(): Telegraf | null {
    return this.bot;
  }
}
