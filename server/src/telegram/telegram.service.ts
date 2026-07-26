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
import { createHash, timingSafeEqual } from 'crypto';
import { Telegraf, Scenes, session, Markup } from 'telegraf';
import { RedisService } from '../redis/redis.service';
import { BotContext, SessionData } from './types/context';
import {
  SCENES,
  TEACHER_DEEP_LINK_PREFIX,
  STUDENT_DEEP_LINK_PREFIX,
  STUDENT_GROUP_DEEP_LINK_RE,
  EMPLOYEE_DEEP_LINK_RE,
  MOCK_EXAM_DEEP_LINK_PREFIX,
  APP_LOGIN_REQUEST_PREFIX,
  VALID_ROLE_IDS,
} from './constants';
import { createTeacherRegistrationScene } from './scenes/teacher-registration.scene';
import { createStudentRegistrationScene } from './scenes/student-registration.scene';
import { createEmployeeRegistrationScene } from './scenes/employee-registration.scene';
import { createMockExamRegistrationScene } from './scenes/mock-exam-registration.scene';
import { createPasswordResetScene } from './scenes/password-reset.scene';
import { approveLoginRequest } from './flows/app-login-otp-flow';
import {
  signEmployeePayload,
  verifyEmployeePayload,
} from './utils/signed-link.util';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { UsersService } from '../users/users.service';
import { EntityHistoryService } from '../common/entity-history';
import { MockExamBillingService } from '../mock-exams/mock-exam-billing.service';
import { PaymentLinkService } from '../payment-gateways/payment-link.service';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot: Telegraf<BotContext>;
  private readonly logger = new Logger(TelegramService.name);
  // Channel-membership gate config (read in onModuleInit). When
  // `requiredChannel` is unset the gate is disabled entirely.
  private requiredChannel?: string;
  private botUsername?: string;

  constructor(
    private configService: ConfigService,
    private redis: RedisService,
    private prisma: PrismaService,
    private uploadService: UploadService,
    private usersService: UsersService,
    private entityHistoryService: EntityHistoryService,
    private mockExamBilling: MockExamBillingService,
    private paymentLinkService: PaymentLinkService,
  ) {}

  async onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN mavjud emas, bot ishga tushmaydi');
      return;
    }

    this.bot = new Telegraf<BotContext>(token);

    // Channel-membership gate (whole bot). Set TELEGRAM_REQUIRED_CHANNEL to
    // e.g. "@daffergana" to require membership before any flow runs; leave
    // it unset to disable the gate (local/dev, or emergency off-switch).
    // The bot must be an ADMIN of that channel for getChatMember to work.
    this.requiredChannel = this.configService
      .get<string>('TELEGRAM_REQUIRED_CHANNEL')
      ?.trim();
    this.botUsername = this.configService
      .get<string>('TELEGRAM_BOT_USERNAME')
      ?.trim()
      ?.replace(/^@/, '');

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

    // Channel-membership gate (whole bot, no exceptions). Runs before the
    // scene stage so every flow — registration, mock exam, app login,
    // password reset — is gated. The "✅ Tekshirish" recheck button is let
    // through so a not-yet-member can confirm they've joined.
    this.bot.use(async (ctx, next) => {
      const cbData =
        ctx.callbackQuery && 'data' in ctx.callbackQuery
          ? (ctx.callbackQuery as { data?: string }).data
          : undefined;
      if (cbData === 'chk_join') return next();

      // Stash the /start payload so we can offer a one-tap resume after
      // the user joins.
      const startText = (ctx.message as any)?.text as string | undefined;
      if (startText && startText.startsWith('/start') && ctx.session) {
        const parts = startText.split(' ');
        ctx.session.pendingStartPayload = parts.length > 1 ? parts[1] : '';
      }

      if (await this.ensureChannelMembership(ctx)) {
        return next();
      }
      // Not a member — join prompt already sent, stop here.
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

    const mockExamScene = createMockExamRegistrationScene(
      this.prisma,
      this.mockExamBilling,
      this.paymentLinkService,
      this.bot,
    );

    const passwordResetScene = createPasswordResetScene(
      this.prisma,
      this.redis,
      this.entityHistoryService,
      this.bot,
    );

    const stage = new Scenes.Stage<BotContext>([
      teacherScene,
      studentScene,
      employeeScene,
      mockExamScene,
      passwordResetScene,
    ]);
    this.bot.use(stage.middleware());

    // /start handler
    this.bot.start(async (ctx) => {
      const payload = ctx.payload;
      this.logger.log(`Bot /start payload: "${payload}"`);

      // Native app login (link/poll) — approve the pending request, app auto-logs-in
      if (payload.startsWith(APP_LOGIN_REQUEST_PREFIX)) {
        const requestId = payload.slice(APP_LOGIN_REQUEST_PREFIX.length);
        const chatId = String(ctx.chat!.id);
        if (!/^[a-zA-Z0-9-]{8,64}$/.test(requestId)) {
          await ctx.reply("Noto'g'ri havola. Ilovadan qayta urinib ko'ring.");
          return;
        }
        const res = await approveLoginRequest(
          this.prisma,
          this.redis,
          chatId,
          requestId,
        );
        if (!res.ok) {
          await ctx.reply(
            res.reason === 'not_found'
              ? "Siz hali ro'yxatdan o'tmagansiz. Administrator bilan bog'laning."
              : "Sizda ilova hisobi yo'q. Administrator bilan bog'laning.",
          );
          return;
        }
        await ctx.reply(
          `✅ ${res.firstName}, ilovaga kirish tasdiqlandi!\n\nEndi ilovaga qayting — avtomatik kirasiz.`,
        );
        return;
      }

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

      // mock_<botStartPayload> — mock exam registration
      if (payload.startsWith(MOCK_EXAM_DEEP_LINK_PREFIX)) {
        ctx.session.processing = true;
        const botStartPayload = payload.slice(
          MOCK_EXAM_DEEP_LINK_PREFIX.length,
        );

        if (!botStartPayload) {
          ctx.session.processing = false;
          await ctx.reply("Noto'g'ri havola.");
          return;
        }

        const exam = await this.prisma.mockExam.findFirst({
          where: { botStartPayload, deletedAt: null },
          select: { id: true, title: true },
        });
        if (!exam) {
          ctx.session.processing = false;
          await ctx.reply(
            'Imtihon topilmadi yoki havola eskirgan. Administrator bilan bog\'laning.',
          );
          return;
        }

        ctx.session.data = { examId: exam.id };
        ctx.session.processing = false;
        await ctx.scene.enter(SCENES.MOCK_EXAM_REGISTRATION);
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
          [
            Markup.button.callback(
              '📄 Mock imtihon natijalari',
              'menu_mock_results',
            ),
          ],
        ]),
      );
    });

    // Channel-membership recheck button ("✅ Tekshirish"). Re-checks
    // membership; on success caches it and offers a one-tap resume of the
    // original flow via a fresh /start deep-link.
    this.bot.action('chk_join', async (ctx) => {
      const channel = this.requiredChannel;
      const userId = ctx.from?.id;
      if (!channel || !userId) {
        await ctx.answerCbQuery();
        return;
      }

      let isMember = false;
      try {
        const member = await this.bot.telegram.getChatMember(channel, userId);
        isMember = member.status !== 'left' && member.status !== 'kicked';
      } catch (err) {
        this.logger.warn(
          `chk_join membership check failed (${channel}): ${(err as Error).message}`,
        );
        isMember = true; // fail-open — don't trap a user on a misconfig
      }

      if (!isMember) {
        await ctx.answerCbQuery(
          "Hali a'zo bo'lmadingiz. Iltimos, kanalga a'zo bo'ling va qayta bosing.",
          { show_alert: true },
        );
        return;
      }

      await ctx.answerCbQuery('Tasdiqlandi ✅');
      if (ctx.session) ctx.session.channelVerified = true;

      const payload = ctx.session?.pendingStartPayload;
      const resumeUrl = this.botUsername
        ? `https://t.me/${this.botUsername}?start=${payload ?? ''}`
        : null;
      try {
        if (resumeUrl) {
          await ctx.editMessageText(
            "✅ A'zolik tasdiqlandi! Davom etish uchun tugmani bosing.",
            Markup.inlineKeyboard([
              [Markup.button.url('▶️ Davom etish', resumeUrl)],
            ]),
          );
        } else {
          await ctx.editMessageText(
            "✅ A'zolik tasdiqlandi! Davom etish uchun /start bosing.",
          );
        }
      } catch {
        // Message may be too old to edit — ignore.
      }
    });

    // Mock exam "pay cash on arrival" button (shown after registration when
    // there's a fee). Records the cash intent on the participant so the
    // admin sees "Naqd kutilmoqda", then confirms to the user. The actual
    // payment is later confirmed by an admin via "To'lov qabul qilish".
    this.bot.action(/^me_cash:(.+)$/, async (ctx) => {
      const participantId = ctx.match[1];
      const chatId = String(ctx.chat!.id);
      try {
        const participant = await this.prisma.mockExamParticipant.findFirst({
          where: { id: participantId, telegramChatId: chatId, deletedAt: null },
          select: { id: true, publicId: true, paid: true, formData: true },
        });
        if (!participant) {
          await ctx.answerCbQuery();
          return;
        }
        if (participant.paid) {
          await ctx.answerCbQuery("To'lov allaqachon amalga oshirilgan.", {
            show_alert: true,
          });
          return;
        }
        const formData =
          participant.formData &&
          typeof participant.formData === 'object' &&
          !Array.isArray(participant.formData)
            ? (participant.formData as Record<string, unknown>)
            : {};
        await this.prisma.mockExamParticipant.update({
          where: { id: participant.id },
          data: {
            formData: { ...formData, __payIntent: 'CASH' } as any,
          },
        });
        await ctx.answerCbQuery('Qabul qilindi ✅');
        try {
          await ctx.editMessageText(
            `💵 Yaxshi! Imtihon kuni markazga kelib, <b>${participant.publicId}</b> ` +
              "ID bilan naqd pul to'lang.\n\n" +
              "Administrator to'lovingizni tasdiqlaganidan so'ng sizga xabar keladi.",
            { parse_mode: 'HTML' },
          );
        } catch {
          // Message too old to edit — ignore.
        }
      } catch (err) {
        this.logger.warn(
          `me_cash failed for ${participantId}: ${(err as Error).message}`,
        );
        await ctx.answerCbQuery();
      }
    });

    // /cancel handler
    this.bot.command('cancel', async (ctx) => {
      await ctx.scene.leave();
      await ctx.reply('Bekor qilindi. Qayta boshlash uchun /start bosing.');
    });

    // Parolni tiklash — sahnaga kirish
    this.bot.action('menu_password', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.scene.enter(SCENES.PASSWORD_RESET);
    });

    // Mock imtihon natijalari — foydalanuvchi qatnashgan ANNOUNCED imtihonlar
    // ro'yxati. Tanlanganida PDFni shaxsiy xabar bilan jo'natadi.
    this.bot.action('menu_mock_results', async (ctx) => {
      await ctx.answerCbQuery();
      const chatId = String(ctx.chat!.id);
      await this.showMockResultsMenu(ctx, chatId);
    });

    // Foydalanuvchi imtihon tanladi → PDFni jo'natamiz.
    this.bot.action(/^mock_result:(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const examId = ctx.match[1];
      const chatId = String(ctx.chat!.id);
      await this.sendMockResultPdf(ctx, chatId, examId);
    });

    // Menu action handlers — "Tez kunda" responses (boshqa tugmalar uchun)
    this.bot.action(
      /^menu_(registration|level|platform|payments|groups)$/,
      async (ctx) => {
        await ctx.answerCbQuery('Bu funksiya tez kunda ishga tushadi! ⏳', {
          show_alert: true,
        });
      },
    );

    // Launch bot (polling mode for development)
    const webhookUrl = this.configService.get<string>('TELEGRAM_WEBHOOK_URL');
    if (webhookUrl) {
      // Register a secret_token so Telegram echoes it back in the
      // X-Telegram-Bot-Api-Secret-Token header on every update — handleWebhook
      // verifies it, rejecting forged POSTs to the public webhook path.
      const secret = this.webhookSecret();
      await this.bot.telegram.setWebhook(
        webhookUrl,
        secret ? { secret_token: secret } : undefined,
      );
      this.logger.log(
        `Bot webhook o'rnatildi: ${webhookUrl}${secret ? ' (secret_token bilan)' : ' (secret_token YO\'Q — TELEGRAM_BOT_TOKEN ham yo\'q)'}`,
      );
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

  // ─── Mock exam results delivery ───────────────────────────────

  /**
   * Channel-membership gate. Returns true when the user may proceed:
   * the gate is disabled (no `requiredChannel`), the user is already
   * verified this session, there is no user context, the membership check
   * errors (fail-open so a misconfig never bricks the bot), or the user is
   * a confirmed member. Returns false (after sending the join prompt) only
   * when the user is definitively not a member.
   */
  private async ensureChannelMembership(ctx: BotContext): Promise<boolean> {
    const channel = this.requiredChannel;
    if (!channel) return true;
    if (ctx.session?.channelVerified) return true;
    const userId = ctx.from?.id;
    if (!userId) return true;

    try {
      const member = await this.bot.telegram.getChatMember(channel, userId);
      if (member.status === 'left' || member.status === 'kicked') {
        await this.sendJoinPrompt(ctx);
        return false;
      }
    } catch (err) {
      this.logger.warn(
        `Kanal a'zoligini tekshirib bo'lmadi (${channel}): ${(err as Error).message}`,
      );
      return true; // fail-open
    }

    if (ctx.session) ctx.session.channelVerified = true;
    return true;
  }

  /** Asks the user to join the required channel, with a recheck button. */
  private async sendJoinPrompt(ctx: BotContext): Promise<void> {
    const channel = this.requiredChannel!;
    const url = channel.startsWith('@')
      ? `https://t.me/${channel.slice(1)}`
      : channel;
    await ctx.reply(
      "Botdan foydalanish uchun avval rasmiy kanalimizga a'zo bo'ling, " +
        'so\'ng "✅ Tekshirish" tugmasini bosing.',
      Markup.inlineKeyboard([
        [Markup.button.url("➕ Kanalga a'zo bo'lish", url)],
        [Markup.button.callback('✅ Tekshirish', 'chk_join')],
      ]),
    );
  }

  /**
   * Pushes the announced results PDF to every participant of `examId`
   * that has a registered Telegram chat. Idempotent — participants with
   * `resultSentAt` already set are skipped. Per-participant errors are
   * logged on the row (`resultSendError`) and do not abort the loop.
   *
   * Called from `MockExamsService.changeStatus` once the PDF generation
   * succeeds and the exam enters ANNOUNCED.
   */
  async broadcastMockResults(examId: string): Promise<{
    sent: number;
    skipped: number;
    failed: number;
  }> {
    const exam = await this.prisma.mockExam.findFirst({
      where: { id: examId, deletedAt: null },
      select: {
        title: true,
        status: true,
        resultsPdfFileKey: true,
      },
    });
    if (!exam) {
      this.logger.warn(`broadcastMockResults: exam ${examId} not found`);
      return { sent: 0, skipped: 0, failed: 0 };
    }
    if (exam.status !== 'ANNOUNCED' || !exam.resultsPdfFileKey) {
      this.logger.warn(
        `broadcastMockResults: exam ${examId} not ready (status=${exam.status}, hasPdf=${!!exam.resultsPdfFileKey})`,
      );
      return { sent: 0, skipped: 0, failed: 0 };
    }

    const recipients = await this.prisma.mockExamParticipant.findMany({
      where: {
        examId,
        deletedAt: null,
        telegramChatId: { not: null },
        resultSentAt: null,
      },
      select: { id: true, publicId: true, telegramChatId: true },
    });

    let sent = 0;
    let failed = 0;
    const caption =
      `📄 <b>${this.escapeHtml(exam.title)}</b> — natijalar e'lon qilindi\n\n` +
      `Sizning identifikatoringizni PDFdan toping va o'z ballaringizni ko'ring.`;
    // Without an explicit filename Telegraf/Telegram serves the URL fetch as
    // `document.dat`. The R2 key has a random suffix, so we synthesize a
    // friendly title from the exam name (Latin/word chars only, trimmed).
    const safeFilename = this.buildPdfFilename(exam.title);

    for (const r of recipients) {
      try {
        const msg = await this.bot.telegram.sendDocument(
          r.telegramChatId!,
          { url: exam.resultsPdfFileKey, filename: safeFilename },
          {
            caption: `${caption}\n\n🆔 Sizning ID: <b>${r.publicId}</b>`,
            parse_mode: 'HTML',
          },
        );
        await this.prisma.mockExamParticipant.update({
          where: { id: r.id },
          data: {
            resultSentAt: new Date(),
            resultMessageId: String(msg.message_id),
            resultSendError: null,
          },
        });
        sent++;
      } catch (err) {
        const reason = (err as Error).message;
        this.logger.warn(
          `broadcastMockResults: failed to send to chat=${r.telegramChatId} participant=${r.id}: ${reason}`,
        );
        await this.prisma.mockExamParticipant.update({
          where: { id: r.id },
          data: { resultSendError: reason.slice(0, 500) },
        });
        failed++;
      }
    }

    const skipped = 0;
    this.logger.log(
      `broadcastMockResults: exam=${examId} sent=${sent} failed=${failed} (total recipients=${recipients.length})`,
    );
    return { sent, skipped, failed };
  }

  /**
   * Lists ANNOUNCED mock exams the user has participated in, with their
   * `publicId`. Pure read — no state changes. If the user hasn't
   * registered for any announced exam, shows an empty-state message.
   */
  private async showMockResultsMenu(
    ctx: BotContext,
    chatId: string,
  ): Promise<void> {
    const participations = await this.prisma.mockExamParticipant.findMany({
      where: {
        telegramChatId: chatId,
        deletedAt: null,
        exam: { status: 'ANNOUNCED', deletedAt: null },
      },
      orderBy: { exam: { examDate: 'desc' } },
      select: {
        publicId: true,
        exam: {
          select: { id: true, title: true, examDate: true },
        },
      },
    });

    if (participations.length === 0) {
      await ctx.reply(
        "Sizda hali natijalari e'lon qilingan mock imtihonlar yo'q.\n\n" +
          "Imtihonlarga ro'yxatga olish uchun adminstratordan havola so'rang.",
      );
      return;
    }

    const buttons = participations.map((p) => {
      const date = p.exam.examDate
        ? this.formatDdMmYyyy(p.exam.examDate)
        : '—';
      const label = `📅 ${date} · ${p.exam.title}`;
      return [Markup.button.callback(label, `mock_result:${p.exam.id}`)];
    });

    await ctx.reply(
      "Qaysi imtihon natijasini ko'rmoqchisiz?\n\n" +
        "Tanlangan imtihon uchun PDF fayl yuboriladi. PDFda sizning " +
        "identifikatoringizni toping va shu raqam yonidagi ballarni ko'ring.",
      Markup.inlineKeyboard(buttons),
    );
  }

  /**
   * Sends the cached results PDF for `examId` to the user, along with a
   * reminder of their `publicId` so they can find their row in the PDF.
   */
  private async sendMockResultPdf(
    ctx: BotContext,
    chatId: string,
    examId: string,
  ): Promise<void> {
    const participant = await this.prisma.mockExamParticipant.findFirst({
      where: {
        examId,
        telegramChatId: chatId,
        deletedAt: null,
      },
      select: {
        publicId: true,
        exam: {
          select: {
            title: true,
            status: true,
            resultsPdfFileKey: true,
          },
        },
      },
    });

    if (!participant) {
      await ctx.reply(
        "Bu imtihonda sizning ishtirokingiz topilmadi.",
      );
      return;
    }

    if (participant.exam.status !== 'ANNOUNCED') {
      await ctx.reply(
        `"${participant.exam.title}" imtihoni natijalari hali e'lon qilinmagan.`,
      );
      return;
    }

    if (!participant.exam.resultsPdfFileKey) {
      await ctx.reply(
        "PDF fayl hali tayyor emas. Administrator bilan bog'laning.",
      );
      return;
    }

    try {
      // The `resultsPdfFileKey` is stored as a full URL — Telegram can
      // fetch documents from a URL directly. Pass an explicit `filename`
      // so Telegram doesn't fall back to `document.dat` when the URL
      // tail has a random R2 key.
      await ctx.replyWithDocument(
        {
          url: participant.exam.resultsPdfFileKey,
          filename: this.buildPdfFilename(participant.exam.title),
        },
        {
          caption:
            `📄 <b>${this.escapeHtml(participant.exam.title)}</b>\n\n` +
            `🆔 Sizning identifikatoringiz: <b>${participant.publicId}</b>\n\n` +
            `PDFda shu raqamni toping va o'z ballaringizni ko'ring.`,
          parse_mode: 'HTML',
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to send mock results PDF (exam=${examId}, chat=${chatId}): ${(err as Error).message}`,
      );
      await ctx.reply(
        "PDF jo'natishda xatolik. Keyinroq qayta urinib ko'ring yoki administrator bilan bog'laning.",
      );
    }
  }

  private formatDdMmYyyy(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Builds a Telegram-safe download filename from an exam title. Telegram
   * rejects most special chars in filenames, so we strip everything except
   * letters / digits / dash / underscore / space and append the `.pdf`
   * extension.
   */
  private buildPdfFilename(title: string): string {
    const clean = title
      .replace(/[^\p{L}\p{N}\-_ ]+/gu, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 80);
    return `${clean || 'mock-exam-natijalar'}.pdf`;
  }

  async handleWebhook(req: any, res: any) {
    if (!this.bot) return;

    // Reject forged updates: when a secret_token is configured, Telegram sends
    // it back in this header. A mismatch means the POST did not originate from
    // Telegram → drop it. (If no secret is configured we process as before, to
    // stay backward-compatible with deployments that have neither secret nor
    // bot token set.)
    const expected = this.webhookSecret();
    if (expected) {
      const received = req?.headers?.['x-telegram-bot-api-secret-token'];
      if (!this.secretMatches(expected, received)) {
        this.logger.warn('Telegram webhook: invalid secret token — rejected');
        res.status(401).send('unauthorized');
        return;
      }
    }

    await this.bot.handleUpdate(req.body, res);
  }

  /**
   * Secret used for Telegram webhook authentication. Prefers an explicit
   * TELEGRAM_WEBHOOK_SECRET; otherwise derives a stable value from the bot
   * token (sha256 hex — valid secret_token charset, ≤256 chars). An attacker
   * who does not know the bot token cannot reproduce it. Returns null only
   * when neither is configured.
   */
  private webhookSecret(): string | null {
    const explicit = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET');
    if (explicit) return explicit;
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (token) return createHash('sha256').update(token).digest('hex');
    return null;
  }

  /** Constant-time comparison of the configured vs received secret token. */
  private secretMatches(expected: string, received: unknown): boolean {
    if (typeof received !== 'string' || received.length === 0) return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    return a.length === b.length && timingSafeEqual(a, b);
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
