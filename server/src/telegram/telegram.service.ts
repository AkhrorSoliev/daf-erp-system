import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Scenes, session, Markup } from 'telegraf';
import { RedisService } from '../redis/redis.service';
import { BotContext, SessionData } from './types/context';
import {
  SCENES,
  TEACHER_DEEP_LINK_PREFIX,
  STUDENT_DEEP_LINK_PREFIX,
  STUDENT_GROUP_DEEP_LINK_RE,
  EMPLOYEE_DEEP_LINK_RE,
  VALID_ROLE_IDS,
} from './constants';
import { createTeacherRegistrationScene } from './scenes/teacher-registration.scene';
import { createStudentRegistrationScene } from './scenes/student-registration.scene';
import { createEmployeeRegistrationScene } from './scenes/employee-registration.scene';
import {
  signEmployeePayload,
  verifyEmployeePayload,
} from './utils/signed-link.util';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { UsersService } from '../users/users.service';
import { EntityHistoryService } from '../common/entity-history';

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
    private entityHistoryService: EntityHistoryService,
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

    // /start kelganda scene state ni tozalash — shunda bot.start() har doim ishlaydi
    // (chat o'chirilganda Redis session'da eski scene qolib ketadi)
    this.bot.use(async (ctx, next) => {
      const text = (ctx.message as any)?.text as string | undefined;
      if (text && text.startsWith('/start')) {
        // Agar boshqa /start jarayonda bo'lsa — bu /start ni e'tiborsiz qoldiramiz
        if (ctx.session?.processing) {
          return;
        }
        // Agar yuklangan rasm bo'lsa, o'chirish
        if (ctx.session?.data?.photo) {
          try {
            await this.uploadService.deleteFile(ctx.session.data.photo);
          } catch {
            // rasm o'chirilmasa ham davom etamiz
          }
        }
        ctx.session.__scenes = {};
        ctx.session.step = 0;
        ctx.session.data = {};
      }
      return next();
    });

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
      this.entityHistoryService,
    );

    const employeeScene = createEmployeeRegistrationScene(
      this.prisma,
      this.uploadService,
      this.usersService,
      this.bot,
    );

    const stage = new Scenes.Stage<BotContext>([
      teacherScene,
      studentScene,
      employeeScene,
    ]);
    this.bot.use(stage.middleware());

    // /start handler
    this.bot.start(async (ctx) => {
      const payload = ctx.payload;
      this.logger.log(`Bot /start payload: "${payload}"`);

      if (payload.startsWith(TEACHER_DEEP_LINK_PREFIX)) {
        ctx.session.processing = true;
        const branchIdStr = payload.slice(TEACHER_DEEP_LINK_PREFIX.length);
        const branchId = Number(branchIdStr);

        if (!branchIdStr || isNaN(branchId)) {
          ctx.session.processing = false;
          await ctx.reply("Noto'g'ri havola. Administrator bilan bog'laning.");
          return;
        }

        const branch = await this.prisma.branch.findUnique({
          where: { id: branchId },
        });
        if (!branch) {
          ctx.session.processing = false;
          await ctx.reply("Filial topilmadi. Administrator bilan bog'laning.");
          return;
        }

        ctx.session.data = { branchId };
        ctx.session.processing = false;
        await ctx.scene.enter(SCENES.TEACHER_REGISTRATION);
        return;
      }

      // employee_{branchId}_roles_{id1,id2,...}_sig_{hmac} — xodim sifatida ro'yxatdan o'tish
      const employeeMatch = payload.match(EMPLOYEE_DEEP_LINK_RE);
      if (employeeMatch) {
        ctx.session.processing = true;
        const branchId = Number(employeeMatch[1]);
        const rawRoleIds = employeeMatch[2]
          .split(',')
          .map((id) => Number(id))
          .filter(
            (id) =>
              Number.isInteger(id) &&
              (VALID_ROLE_IDS as readonly number[]).includes(id),
          );
        const providedSig = employeeMatch[3];

        if (
          rawRoleIds.length === 0 ||
          !verifyEmployeePayload(branchId, rawRoleIds, providedSig)
        ) {
          ctx.session.processing = false;
          this.logger.warn(`Invalid employee deep-link payload: "${payload}"`);
          await ctx.reply(
            "Noto'g'ri yoki buzilgan havola. Administrator bilan bog'laning.",
          );
          return;
        }

        const branch = await this.prisma.branch.findUnique({
          where: { id: branchId },
        });
        if (!branch) {
          ctx.session.processing = false;
          await ctx.reply("Filial topilmadi. Administrator bilan bog'laning.");
          return;
        }

        ctx.session.data = { branchId, roleIds: rawRoleIds };
        ctx.session.processing = false;
        await ctx.scene.enter(SCENES.EMPLOYEE_REGISTRATION);
        return;
      }

      // student_{branchId}_group_{groupId} — guruhga to'g'ridan-to'g'ri ro'yxatdan o'tish
      const groupMatch = payload.match(STUDENT_GROUP_DEEP_LINK_RE);
      if (groupMatch) {
        ctx.session.processing = true;
        const branchId = Number(groupMatch[1]);
        const groupId = groupMatch[2];

        const branch = await this.prisma.branch.findUnique({
          where: { id: branchId },
        });
        if (!branch) {
          ctx.session.processing = false;
          await ctx.reply("Filial topilmadi. Administrator bilan bog'laning.");
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
              select: {
                teacher: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
              take: 1,
            },
          },
        });
        if (!group) {
          ctx.session.processing = false;
          await ctx.reply("Guruh topilmadi. Administrator bilan bog'laning.");
          return;
        }

        const teacher = group.teachers[0]?.teacher;
        ctx.session.data = {
          branchId,
          groupId: group.id,
          groupName: group.name,
          teacherId: teacher?.id ?? null,
          teacherName: teacher
            ? `${teacher.firstName} ${teacher.lastName}`
            : '—',
          lessonStartTime: group.lessonStartTime,
          lessonEndTime: group.lessonEndTime,
          days: group.days,
          exactDays: group.exactDays,
          roomName: group.room?.name ?? null,
        };
        ctx.session.processing = false;
        await ctx.scene.enter(SCENES.STUDENT_REGISTRATION);
        return;
      }

      if (payload.startsWith(STUDENT_DEEP_LINK_PREFIX)) {
        ctx.session.processing = true;
        const branchIdStr = payload.slice(STUDENT_DEEP_LINK_PREFIX.length);
        const branchId = Number(branchIdStr);

        if (!branchIdStr || isNaN(branchId)) {
          ctx.session.processing = false;
          await ctx.reply("Noto'g'ri havola. Administrator bilan bog'laning.");
          return;
        }

        const branch = await this.prisma.branch.findUnique({
          where: { id: branchId },
        });
        if (!branch) {
          ctx.session.processing = false;
          await ctx.reply("Filial topilmadi. Administrator bilan bog'laning.");
          return;
        }

        ctx.session.data = { branchId };
        ctx.session.processing = false;
        await ctx.scene.enter(SCENES.STUDENT_REGISTRATION);
        return;
      }

      await ctx.reply(
        'Assalomu alaykum! DaF Sprachzentrum botiga xush kelibsiz.\n\n' +
          'Quyidagi imkoniyatlardan birini tanlang:',
        Markup.inlineKeyboard([
          [
            Markup.button.callback("📝 Ro'yxatdan o'tish", 'menu_registration'),
            Markup.button.callback('📊 Darajani aniqlash', 'menu_level'),
          ],
          [
            Markup.button.callback('🎓 Platformaga kirish', 'menu_platform'),
            Markup.button.callback("💳 To'lovlar", 'menu_payments'),
          ],
          [
            Markup.button.callback("👥 Guruhlarga qo'shilish", 'menu_groups'),
            Markup.button.callback('🔐 Parolni tiklash', 'menu_password'),
          ],
        ]),
      );
    });

    // /cancel handler
    this.bot.command('cancel', async (ctx) => {
      await ctx.scene.leave();
      await ctx.reply('Bekor qilindi. Qayta boshlash uchun /start bosing.');
    });

    // Menu action handlers — "Tez kunda" responses
    this.bot.action(
      /^menu_(registration|level|platform|payments|groups|password)$/,
      async (ctx) => {
        await ctx.answerCbQuery('Bu funksiya tez kunda ishga tushadi! ⏳', {
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

  onModuleDestroy() {
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

  async generateEmployeeLinkPayload(
    branchId: number,
    roleIds: number[],
    requestedBy: { id: number; roles: string[] },
  ): Promise<string> {
    const unique = Array.from(new Set(roleIds));
    if (unique.length === 0) {
      throw new BadRequestException('Kamida bitta lavozim tanlang');
    }
    const invalid = unique.filter(
      (id) => !(VALID_ROLE_IDS as readonly number[]).includes(id),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Noto'g'ri lavozim ID: ${invalid.join(', ')}`,
      );
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException('Filial topilmadi');
    }

    const isCEO = requestedBy.roles.includes('CEO');
    if (!isCEO) {
      const caller = await this.prisma.user.findFirst({
        where: { id: requestedBy.id, deletedAt: null },
        select: {
          mainBranch: true,
          branches: { select: { branchId: true } },
        },
      });
      const allowedBranchIds = new Set<number>([
        ...(caller?.branches.map((b) => b.branchId) ?? []),
        ...(caller?.mainBranch ? [caller.mainBranch] : []),
      ]);
      if (!allowedBranchIds.has(branchId)) {
        throw new ForbiddenException(
          "Siz faqat o'z filialingiz uchun havola yarata olasiz",
        );
      }
    }

    return signEmployeePayload(branchId, unique);
  }
}
