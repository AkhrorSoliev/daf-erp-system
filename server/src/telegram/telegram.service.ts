import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Scenes, session, Markup } from 'telegraf';
import { RedisService } from '../redis/redis.service';
import { BotContext, SessionData } from './types/context';
import { SCENES, TEACHER_DEEP_LINK_PREFIX, STUDENT_DEEP_LINK_PREFIX, STUDENT_GROUP_DEEP_LINK_RE } from './constants';
import { createTeacherRegistrationScene } from './scenes/teacher-registration.scene';
import { createStudentRegistrationScene } from './scenes/student-registration.scene';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot: Telegraf<BotContext>;
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private configService: ConfigService,
    private redis: RedisService,
    private prisma: PrismaService,
    private uploadService: UploadService,
    private usersService: UsersService,
  ) {}

  async onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN mavjud emas, bot ishga tushmaydi');
      return;
    }

    this.bot = new Telegraf<BotContext>(token);

    // Redis session store
    this.bot.use(
      session({
        store: {
          get: async (key: string) => {
            const data = await this.redis.get(`bot:session:${key}`);
            return data ? JSON.parse(data) : undefined;
          },
          set: async (key: string, value: SessionData) => {
            await this.redis.set(
              `bot:session:${key}`,
              JSON.stringify(value),
              'EX',
              86400, // 24 soat
            );
          },
          delete: async (key: string) => {
            await this.redis.del(`bot:session:${key}`);
          },
        },
        defaultSession: (): SessionData => ({
          step: 0,
          data: {},
          __scenes: {},
        }),
      }),
    );

    // Scenes
    const teacherScene = createTeacherRegistrationScene(
      this.prisma,
      this.uploadService,
      this.usersService,
      this.bot,
    );

    const studentScene = createStudentRegistrationScene(
      this.prisma,
      this.uploadService,
      this.bot,
    );

    const stage = new Scenes.Stage<BotContext>([teacherScene, studentScene]);
    this.bot.use(stage.middleware());

    // /start handler
    this.bot.start(async (ctx) => {
      const payload = ctx.payload;
      this.logger.log(`Bot /start payload: "${payload}"`);

      if (payload.startsWith(TEACHER_DEEP_LINK_PREFIX)) {
        const branchIdStr = payload.slice(TEACHER_DEEP_LINK_PREFIX.length);
        const branchId = Number(branchIdStr);

        if (!branchIdStr || isNaN(branchId)) {
          await ctx.reply(
            "Noto'g'ri havola. Administrator bilan bog'laning.",
          );
          return;
        }

        const branch = await this.prisma.branch.findUnique({
          where: { id: branchId },
        });
        if (!branch) {
          await ctx.reply(
            "Filial topilmadi. Administrator bilan bog'laning.",
          );
          return;
        }

        ctx.session.data = { branchId };
        await ctx.scene.enter(SCENES.TEACHER_REGISTRATION);
        return;
      }

      // student_{branchId}_group_{groupId} — guruhga to'g'ridan-to'g'ri ro'yxatdan o'tish
      const groupMatch = payload.match(STUDENT_GROUP_DEEP_LINK_RE);
      if (groupMatch) {
        const branchId = Number(groupMatch[1]);
        const groupId = groupMatch[2];

        const branch = await this.prisma.branch.findUnique({
          where: { id: branchId },
        });
        if (!branch) {
          await ctx.reply(
            "Filial topilmadi. Administrator bilan bog'laning.",
          );
          return;
        }

        const group = await this.prisma.group.findFirst({
          where: { id: groupId, branchId, deletedAt: null },
          select: {
            id: true,
            name: true,
            lessonStartTime: true,
            lessonEndTime: true,
            days: true,
            exactDays: true,
            room: { select: { name: true } },
            teachers: {
              select: { teacher: { select: { id: true, name: true } } },
              take: 1,
            },
          },
        });
        if (!group) {
          await ctx.reply(
            "Guruh topilmadi. Administrator bilan bog'laning.",
          );
          return;
        }

        const teacher = group.teachers[0]?.teacher;
        ctx.session.data = {
          branchId,
          groupId: group.id,
          groupName: group.name,
          teacherId: teacher?.id ?? null,
          teacherName: teacher?.name ?? '—',
          lessonStartTime: group.lessonStartTime,
          lessonEndTime: group.lessonEndTime,
          days: group.days,
          exactDays: group.exactDays,
          roomName: group.room?.name ?? null,
        };
        await ctx.scene.enter(SCENES.STUDENT_REGISTRATION);
        return;
      }

      if (payload.startsWith(STUDENT_DEEP_LINK_PREFIX)) {
        const branchIdStr = payload.slice(STUDENT_DEEP_LINK_PREFIX.length);
        const branchId = Number(branchIdStr);

        if (!branchIdStr || isNaN(branchId)) {
          await ctx.reply(
            "Noto'g'ri havola. Administrator bilan bog'laning.",
          );
          return;
        }

        const branch = await this.prisma.branch.findUnique({
          where: { id: branchId },
        });
        if (!branch) {
          await ctx.reply(
            "Filial topilmadi. Administrator bilan bog'laning.",
          );
          return;
        }

        ctx.session.data = { branchId };
        await ctx.scene.enter(SCENES.STUDENT_REGISTRATION);
        return;
      }

      await ctx.reply(
        "Assalomu alaykum! DaF Sprachzentrum botiga xush kelibsiz.\n\n" +
          "Quyidagi imkoniyatlardan birini tanlang:",
        Markup.inlineKeyboard([
          [
            Markup.button.callback("📝 Ro'yxatdan o'tish", "menu_registration"),
            Markup.button.callback("📊 Darajani aniqlash", "menu_level"),
          ],
          [
            Markup.button.callback("🎓 Platformaga kirish", "menu_platform"),
            Markup.button.callback("💳 To'lovlar", "menu_payments"),
          ],
          [
            Markup.button.callback("👥 Guruhlarga qo'shilish", "menu_groups"),
            Markup.button.callback("🔐 Parolni tiklash", "menu_password"),
          ],
        ]),
      );
    });

    // /cancel handler
    this.bot.command('cancel', async (ctx) => {
      await ctx.scene.leave();
      await ctx.reply("Bekor qilindi. Qayta boshlash uchun /start bosing.");
    });

    // Menu action handlers — "Tez kunda" responses
    this.bot.action(
      /^menu_(registration|level|platform|payments|groups|password)$/,
      async (ctx) => {
        await ctx.answerCbQuery("Bu funksiya tez kunda ishga tushadi! ⏳", {
          show_alert: true,
        });
      },
    );

    // Launch bot (polling mode for development)
    const webhookUrl = this.configService.get<string>('TELEGRAM_WEBHOOK_URL');
    if (webhookUrl) {
      await this.bot.telegram.setWebhook(webhookUrl);
      this.logger.log(`Bot webhook o'rnatildi: ${webhookUrl}`);
    } else {
      this.bot.launch().catch((err) => {
        this.logger.error('Bot ishga tushirishda xatolik:', err.message);
      });
      this.logger.log('Bot polling rejimida ishga tushdi');
    }
  }

  async onModuleDestroy() {
    if (this.bot) {
      this.bot.stop('NestJS shutdown');
    }
  }

  getBot(): Telegraf<BotContext> {
    return this.bot;
  }

  async handleWebhook(req: any, res: any) {
    if (this.bot) {
      await this.bot.handleUpdate(req.body, res);
    }
  }
}
