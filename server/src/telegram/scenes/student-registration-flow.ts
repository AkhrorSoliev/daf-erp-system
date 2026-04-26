import { Markup } from 'telegraf';
import * as bcrypt from 'bcryptjs';
import { BotContext } from '../types/context';
import { DEFAULT_COMPANY_ID } from '../constants';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../upload/upload.service';
import { EntityHistoryService } from '../../common/entity-history';
import { generatePassword } from '../../common/utils/password.util';
import { downloadFile } from '../utils/download.util';

const STUDENT_ROLE_ID = 6;

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
  ctx.session.data.photo = photoUrl;
  ctx.session.step = 7;

  const data = ctx.session.data;
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
}

/**
 * Telegram bot orqali yangi o'quvchini ro'yxatdan o'tkazish:
 * Student → Enrollment → User (login/parol) yaratiladi va
 * har bir bosqich uchun audit yozuvi qo'shiladi.
 * Returns: yaratilgan login parolni — caller foydalanuvchiga jo'natadi.
 */
export async function registerStudentFromTelegram(
  prisma: PrismaService,
  entityHistoryService: EntityHistoryService,
  data: RegistrationData,
  chatId: string,
): Promise<{ plainPassword: string }> {
  const student = await prisma.student.create({
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

  await entityHistoryService.recordCreate({
    entityType: 'Student',
    entityId: student.id,
    newValues: {
      ism: data.firstName,
      familiya: data.lastName,
      telefon: data.phone,
      action: 'TELEGRAM_ROYXATDAN_OTDI',
    },
    companyId: DEFAULT_COMPANY_ID,
  });

  const enrollment = await prisma.enrollment.create({
    data: {
      studentId: student.id,
      groupId: data.groupId,
    },
  });

  // Activity report — initial state log entry
  await prisma.enrollmentStateLog.create({
    data: {
      enrollmentId: enrollment.id,
      status: 'ACTIVE',
      transitionAt: enrollment.createdAt,
    },
  });

  await entityHistoryService.recordCreate({
    entityType: 'Student',
    entityId: student.id,
    newValues: {
      guruh: data.groupName,
      guruhId: data.groupId,
      action: 'GURUHGA_QOSHILDI',
    },
    companyId: DEFAULT_COMPANY_ID,
  });

  await entityHistoryService.recordCreate({
    entityType: 'Enrollment',
    entityId: enrollment.id,
    newValues: {
      studentId: student.id,
      groupId: data.groupId,
      status: 'ACTIVE',
    },
    companyId: DEFAULT_COMPANY_ID,
  });

  await entityHistoryService.recordCreate({
    entityType: 'Group',
    entityId: data.groupId,
    newValues: {
      action: 'OQUVCHI_QOSHILDI',
      oquvchi: `${data.firstName} ${data.lastName}`,
      oquvchiId: student.id,
    },
    companyId: DEFAULT_COMPANY_ID,
  });

  const plainPassword = generatePassword();
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const user = await prisma.user.create({
    data: {
      login: data.phone,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      companyId: DEFAULT_COMPANY_ID,
      roles: { create: [{ roleId: STUDENT_ROLE_ID }] },
    },
  });

  await prisma.student.update({
    where: { id: student.id },
    data: { userId: user.id },
  });

  return { plainPassword };
}
