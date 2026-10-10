import { Markup } from 'telegraf';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { BotContext } from '../types/context';
import { DEFAULT_COMPANY_ID } from '../constants';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../upload/upload.service';
import { EntityHistoryService } from '../../common/entity-history';
import {
  SELF_SIGNUP_SOURCE,
  StudentLeadOriginService,
} from '../../common/student-origin';
import { openStudentAccount } from '../../common/auth/student-account';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import { downloadFile } from '../utils/download.util';
import {
  STUDENT_SELF_ENROLLED,
  type StudentSelfEnrolledEvent,
} from '../../common/events/self-enrollment.events';

// Session data is untyped in the bot — caller already validated all
// required fields by the time confirm_student fires.
type RegistrationData = Record<string, any>;

/**
 * Telegram'dan kelgan rasmni R2'ga yuklab, captured ma'lumotlarni
 * tasdiqlash kartasi ko'rinishida ko'rsatish.
 */
export async function uploadStudentPhoto(
  ctx: BotContext,
  uploadService: UploadService,
  fileId: string,
  mimetype: string,
) {
  await ctx.sendChatAction('upload_photo');

  const fileLink = await ctx.telegram.getFileLink(fileId);
  const buffer = await downloadFile(fileLink.href);

  const ext = mimetype === 'image/png' ? '.png' : '.jpg';
  const multerFile = {
    originalname: `student_${ctx.chat!.id}${ext}`,
    buffer,
    mimetype,
  } as Express.Multer.File;

  const photoUrl = await uploadService.uploadFile(multerFile, 'students');

  const data = ctx.session.data;
  try {
    await ctx.replyWithPhoto(photoUrl, {
      caption:
        "📋 Ma'lumotlaringizni tekshiring:\n\n" +
        `👨‍🏫 O'qituvchi: ${data.teacherName}\n` +
        `📚 Guruh: ${data.groupName}\n` +
        `👤 Ism: ${data.firstName}\n` +
        `👤 Familiya: ${data.lastName}\n` +
        `📞 Telefon: +998 ${data.phone}`,
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Tasdiqlash', 'confirm_student'),
          Markup.button.callback('🔄 Qayta kiritish', 'restart_student'),
        ],
      ]),
    });
  } catch (err) {
    // The person is asked to send the photo again, so nobody will confirm
    // this one: delete it now rather than lose track of it.
    await uploadService.deleteFile(photoUrl);
    throw err;
  }
  // Only a preview that arrived moves the person on: step 7 waits for its
  // buttons and ignores a photo sent again.
  ctx.session.data.photo = photoUrl;
  ctx.session.step = 7;
}

/**
 * What an approval adds (ADR-0080): the administrator who approved, recorded
 * on the lead and on every history row, a step that runs inside the card's
 * own transaction — the request is taken there, so a second approval writes
 * no second card — and a signal that the transaction committed, so a failure
 * after it is told apart from one that wrote nothing.
 */
export interface RegistrationOptions {
  actorId?: number;
  inTx?: (tx: Prisma.TransactionClient, studentId: number) => Promise<void>;
  onCommit?: () => void;
}

/**
 * Telegram bot orqali yangi o'quvchini ro'yxatdan o'tkazish:
 * Student → Enrollment → User (login/parol) va har bosqichning audit yozuvi
 * bitta tranzaksiyada yaratiladi.
 * Returns: yaratilgan login parolni — caller foydalanuvchiga jo'natadi.
 */
export async function registerStudentFromTelegram(
  prisma: PrismaService,
  entityHistoryService: EntityHistoryService,
  leadOrigin: StudentLeadOriginService,
  data: RegistrationData,
  chatId: string,
  events: Pick<EventEmitter2, 'emitAsync'>,
  options: RegistrationOptions = {},
): Promise<{ plainPassword: string }> {
  // Har bir o'quvchi lid yozuvi qoldiradi (ADR-0017). Bu yo'l `/students`
  // eshigidan o'tmaydi — bazaga to'g'ridan yozadi — shuning uchun lidni
  // o'zi yozishi kerak. O'quvchi va lid bitta tranzaksiyada: lid yozilmasa
  // o'quvchi ham yozilmaydi, aks holda voronkada yana teshik qolardi.
  // The group and the sign-in account join them: a card is never left
  // without its group or its account (ADR-0033).
  const { enrollment, plainPassword } = await prisma.$transaction(
    async (tx) => {
      const created = await tx.student.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          photo: data.photo,
          telegramChatId: chatId,
          companyId: DEFAULT_COMPANY_ID,
          branches: {
            create: [{ branchId: data.branchId }],
          },
        },
      });

      await leadOrigin.recordSelfSignupOrigin(
        tx,
        {
          studentId: created.id,
          firstName: created.firstName,
          lastName: created.lastName,
          phone: created.phone,
          branchId: data.branchId,
          companyId: DEFAULT_COMPANY_ID,
          // The approving administrator; none before ADR-0080.
          userId: options.actorId,
        },
        SELF_SIGNUP_SOURCE.TELEGRAM_BOT,
      );

      if (options.inTx) await options.inTx(tx, created.id);

      // The join day, like the admin flow writes it (UTC midnight of the
      // Tashkent day). Without it the first monthly charge reached back to
      // the 1st and billed a student who joined mid-month for the whole month.
      const enrolled = await tx.enrollment.create({
        data: {
          studentId: created.id,
          groupId: data.groupId,
          startDate: utcMidnightFromDateStr(tashkentDateStr(new Date())),
        },
      });

      // Activity report — initial state log entry
      await tx.enrollmentStateLog.create({
        data: {
          enrollmentId: enrolled.id,
          status: 'ACTIVE',
          transitionAt: enrolled.createdAt,
        },
      });

      // The card's sign-in account (ADR-0033). The bot shows this password
      // to the student who just registered.
      const account = await openStudentAccount(tx, {
        id: created.id,
        phone: data.phone,
        firstName: data.firstName,
        lastName: data.lastName,
        companyId: DEFAULT_COMPANY_ID,
      });

      // The history rows commit with what they describe: a failed row rolls
      // the card back instead of failing after it, when the approval could
      // no longer send the password.
      const history = {
        companyId: DEFAULT_COMPANY_ID,
        changedById: options.actorId,
        tx,
      };
      await entityHistoryService.recordCreate({
        ...history,
        entityType: 'Student',
        entityId: created.id,
        newValues: {
          ism: data.firstName,
          familiya: data.lastName,
          telefon: data.phone,
          action: 'TELEGRAM_ROYXATDAN_OTDI',
        },
      });
      await entityHistoryService.recordCreate({
        ...history,
        entityType: 'Student',
        entityId: created.id,
        newValues: {
          guruh: data.groupName,
          guruhId: data.groupId,
          action: 'GURUHGA_QOSHILDI',
        },
      });
      await entityHistoryService.recordCreate({
        ...history,
        entityType: 'Enrollment',
        entityId: enrolled.id,
        newValues: {
          studentId: created.id,
          groupId: data.groupId,
          status: 'ACTIVE',
        },
      });
      await entityHistoryService.recordCreate({
        ...history,
        entityType: 'Group',
        entityId: data.groupId,
        newValues: {
          action: 'OQUVCHI_QOSHILDI',
          oquvchi: `${data.firstName} ${data.lastName}`,
          oquvchiId: created.id,
        },
      });

      return { enrollment: enrolled, plainPassword: account.plainPassword };
    },
  );
  options.onCommit?.();

  // Billing charges the join month now, as the admin door does. Left to the
  // 04:00 daily run, a sign-up on a month's last lesson day was never billed
  // for it (30.09.2026: five students). After the commit, because the
  // listener reads the enrollment.
  await events.emitAsync(STUDENT_SELF_ENROLLED, {
    enrollmentId: enrollment.id,
    companyId: DEFAULT_COMPANY_ID,
  } satisfies StudentSelfEnrolledEvent);

  return { plainPassword };
}
