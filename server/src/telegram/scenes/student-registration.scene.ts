import { Logger } from '@nestjs/common';
import { Scenes, Markup, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { BotContext } from '../types/context';
import { SCENES } from '../constants';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../upload/upload.service';
import { EntityHistoryService } from '../../common/entity-history';
import {
  ASK_FIRST_NAME,
  ASK_LAST_NAME,
  FIRST_NAME_TOO_SHORT,
  LAST_NAME_TOO_SHORT,
  MULTI_WORD_NAME_HINT,
  looksLikeFullName,
} from '../name-prompts';
import {
  normalizeSharedPhone,
  SHARED_PHONE_INVALID,
} from '../phone-utils';
import {
  buildTeachersKeyboard,
  daysMap,
  formatQrGroupInfo,
  loadTeachersForBranch,
  TEACHER_ROLE_ID,
} from './student-registration-helpers';
import {
  registerStudentFromTelegram,
  uploadStudentPhoto,
} from './student-registration-flow';

/**
 * Student registration flow:
 * Step 1: Ustozlar ro'yxati ko'rsatiladi → tanlash
 * Step 2: Tanlangan ustozning guruhlari ko'rsatiladi → tanlash
 * Step 3: Ism kiritish
 * Step 4: Familiya kiritish
 * Step 5: Telefon raqam yuborish
 * Step 6: Rasm yuborish
 * Step 7: Tasdiqlash
 */
export function createStudentRegistrationScene(
  prisma: PrismaService,
  uploadService: UploadService,
  _bot: Telegraf<BotContext>,
  entityHistoryService: EntityHistoryService,
): Scenes.BaseScene<BotContext> {
  const logger = new Logger('StudentRegistrationScene');
  const scene = new Scenes.BaseScene<BotContext>(SCENES.STUDENT_REGISTRATION);

  // Loading button bosilganda — hech narsa qilmaslik
  scene.action('noop', async (ctx) => {
    await ctx.answerCbQuery('Iltimos, kuting...');
  });

  // Scene'ga kirganda — ustozlar ro'yxatini ko'rsatish
  scene.enter(async (ctx) => {
    const branchId = ctx.session.data?.branchId;
    if (!branchId) {
      await ctx.reply("Xatolik: filial aniqlanmadi. Qayta urinib ko'ring.");
      await ctx.scene.leave();
      return;
    }

    const chatId = String(ctx.chat!.id);
    const existingStudent = await prisma.student.findFirst({
      where: { telegramChatId: chatId, deletedAt: null },
    });
    if (existingStudent) {
      await ctx.reply("Siz allaqachon ro'yxatdan o'tgansiz!");
      await ctx.scene.leave();
      return;
    }

    // QR kod orqali guruh bilan kelgan bo'lsa — to'g'ridan-to'g'ri ism kiritishga o'tish
    if (ctx.session.data.groupId) {
      ctx.session.step = 3;
      const info = formatQrGroupInfo(ctx.session.data);
      await ctx.reply(
        `Assalomu alaykum!\nQuyidagi guruhga ro'yxatdan o'tish:\n\n${info}\n${ASK_FIRST_NAME}`,
      );
      return;
    }

    ctx.session.step = 1;
    ctx.session.data = { branchId };

    await ctx.sendChatAction('typing');

    const teachers = await loadTeachersForBranch(prisma, branchId);

    if (teachers.length === 0) {
      await ctx.reply("Hozirda ushbu filialda o'qituvchilar mavjud emas.");
      await ctx.scene.leave();
      return;
    }

    await ctx.reply(
      "Assalomu alaykum! O'quvchi sifatida ro'yxatdan o'tish.\n\n" +
        "O'qituvchingizni tanlang:",
      Markup.inlineKeyboard(buildTeachersKeyboard(teachers)),
    );
  });

  // Ustoz tanlash
  scene.action(/^select_teacher_(\d+)$/, async (ctx) => {
    if (ctx.session.step !== 1) return;
    if (ctx.session.processing) return;
    ctx.session.processing = true;
    await ctx.answerCbQuery();

    const teacherId = Number(ctx.match[1]);
    const branchId = ctx.session.data.branchId;

    await ctx.sendChatAction('typing');

    const teacher = await prisma.user.findFirst({
      where: {
        id: teacherId,
        deletedAt: null,
        roles: { some: { roleId: TEACHER_ROLE_ID } },
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!teacher) {
      ctx.session.processing = false;
      await ctx.reply("O'qituvchi topilmadi. Qayta tanlang.");
      return;
    }

    ctx.session.data.teacherId = teacherId;
    ctx.session.data.teacherName = `${teacher.firstName} ${teacher.lastName}`;

    const groups = await prisma.group.findMany({
      where: {
        deletedAt: null,
        branchId,
        teachers: { some: { teacherId } },
      },
      select: {
        id: true,
        name: true,
        lessonStartTime: true,
        lessonEndTime: true,
        days: true,
        course: { select: { name: true, price: true } },
      },
      orderBy: { name: 'asc' },
    });

    if (groups.length === 0) {
      ctx.session.processing = false;
      await ctx.editMessageText(
        `${teacher.firstName} ${teacher.lastName} — hozirda guruhlari mavjud emas.`,
      );
      ctx.session.step = 1;
      const teachers = await loadTeachersForBranch(prisma, branchId);
      await ctx.reply(
        "Boshqa o'qituvchini tanlang:",
        Markup.inlineKeyboard(buildTeachersKeyboard(teachers)),
      );
      return;
    }

    ctx.session.step = 2;
    ctx.session.processing = false;

    const buttons = groups.map((g) => {
      const time =
        g.lessonStartTime && g.lessonEndTime
          ? `${g.lessonStartTime}–${g.lessonEndTime}`
          : '';
      const days = g.days ? (daysMap[g.days] ?? '') : '';
      const price = g.course.price.toLocaleString('en-US');
      const label = `${g.name} | ${days} ${time} | ${price} so'm`;
      return [Markup.button.callback(label, `select_group_${g.id}`)];
    });

    buttons.push([Markup.button.callback('⬅️ Orqaga', 'back_to_teachers')]);

    await ctx.editMessageText(
      `👨‍🏫 ${teacher.firstName} ${teacher.lastName}\n\nGuruhni tanlang:`,
    );
    await ctx.reply(
      'Quyidagi guruhlardan birini tanlang:',
      Markup.inlineKeyboard(buttons),
    );
  });

  // Orqaga — ustozlar ro'yxatiga
  scene.action('back_to_teachers', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.step = 1;
    const branchId = ctx.session.data.branchId;
    const teachers = await loadTeachersForBranch(prisma, branchId);
    await ctx.editMessageText(
      "O'qituvchingizni tanlang:",
      Markup.inlineKeyboard(buildTeachersKeyboard(teachers)),
    );
  });

  // Guruh tanlash
  scene.action(/^select_group_(.+)$/, async (ctx) => {
    if (ctx.session.step !== 2) return;
    await ctx.answerCbQuery();

    const groupId = ctx.match[1];

    const group = await prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!group) {
      await ctx.reply('Guruh topilmadi. Qayta tanlang.');
      return;
    }

    ctx.session.data.groupId = groupId;
    ctx.session.data.groupName = group.name;
    ctx.session.step = 3;

    await ctx.editMessageText(`✅ Guruh tanlandi: ${group.name}`);
    await ctx.reply(ASK_FIRST_NAME);
  });

  // Text xabarlari
  scene.on(message('text'), async (ctx) => {
    if (ctx.session.processing) return;
    const step = ctx.session.step;
    const text = ctx.message.text.trim();

    if (text === '/cancel') {
      if (ctx.session.data?.photo) {
        await uploadService.deleteFile(ctx.session.data.photo);
      }
      await ctx.scene.leave();
      await ctx.reply(
        'Bekor qilindi. Qayta boshlash uchun /start bosing.',
        Markup.removeKeyboard(),
      );
      return;
    }

    if (text.startsWith('/start')) {
      if (ctx.session.data?.photo) {
        await uploadService.deleteFile(ctx.session.data.photo);
      }
      await ctx.scene.reenter();
      return;
    }

    switch (step) {
      case 3: {
        if (text.length < 2) {
          await ctx.reply(FIRST_NAME_TOO_SHORT);
          return;
        }
        // Ism o'rniga to'liq ism-familiya yozilgan — bir marta tushuntirib
        // qayta so'raymiz, aks holda familiya ikki marta yozilib qolardi.
        if (looksLikeFullName(text)) {
          await ctx.reply(MULTI_WORD_NAME_HINT);
          return;
        }
        ctx.session.data.firstName = text;
        ctx.session.step = 4;
        await ctx.reply(ASK_LAST_NAME);
        break;
      }

      case 4: {
        if (text.length < 2) {
          await ctx.reply(LAST_NAME_TOO_SHORT);
          return;
        }
        ctx.session.data.lastName = text;
        ctx.session.step = 5;
        await ctx.reply(
          'Telefon raqamingizni yuboring:',
          Markup.keyboard([
            [Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
          ])
            .resize()
            .oneTime(),
        );
        break;
      }

      case 5: {
        await ctx.reply(
          'Iltimos, telefon raqamni quyidagi tugma orqali yuboring:',
          Markup.keyboard([
            [Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
          ])
            .resize()
            .oneTime(),
        );
        break;
      }

      case 6: {
        await ctx.reply('Iltimos, rasmingizni yuboring (foto sifatida).');
        break;
      }

      default:
        break;
    }
  });

  // Contact share
  scene.on(message('contact'), async (ctx) => {
    if (ctx.session.step !== 5) return;
    if (ctx.session.processing) return;

    const contact = ctx.message.contact;
    // Kontakt tugmasidan kelgan raqamni Telegram o'zi beradi — chet el
    // raqami ham qabul qilinadi (o'zbek raqami 9 xonaga keltiriladi).
    const phone = normalizeSharedPhone(contact.phone_number);
    if (!phone) {
      await ctx.reply(
        SHARED_PHONE_INVALID,
        Markup.keyboard([
          [Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
        ])
          .resize()
          .oneTime(),
      );
      return;
    }

    const existing = await prisma.student.findFirst({
      where: { phone, deletedAt: null },
    });
    if (existing) {
      await ctx.reply(
        "Bu telefon raqam allaqachon tizimda ro'yxatdan o'tgan. " +
          "Muammo bo'lsa administrator bilan bog'laning.",
        Markup.removeKeyboard(),
      );
      await ctx.scene.leave();
      return;
    }

    ctx.session.data.phone = phone;
    ctx.session.step = 6;
    await ctx.reply(
      'Rasmingizni yuboring (foto sifatida):',
      Markup.removeKeyboard(),
    );
  });

  // Rasm qabul qilish (compressed photo)
  scene.on(message('photo'), async (ctx) => {
    if (ctx.session.step !== 6) return;
    if (ctx.session.processing) return;

    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1];

    try {
      await uploadStudentPhoto(ctx, uploadService, photo.file_id, 'image/jpeg');
    } catch {
      await ctx.reply('Rasmni yuklashda xatolik yuz berdi. Qayta yuboring:');
    }
  });

  // Rasm qabul qilish (document/fayl sifatida)
  scene.on(message('document'), async (ctx) => {
    if (ctx.session.step !== 6) return;
    if (ctx.session.processing) return;

    const doc = ctx.message.document;
    const mime = doc.mime_type || '';

    if (!mime.startsWith('image/')) {
      await ctx.reply('Iltimos, rasm formatidagi fayl yuboring (JPG, PNG).');
      return;
    }

    try {
      await uploadStudentPhoto(ctx, uploadService, doc.file_id, mime);
    } catch {
      await ctx.reply('Rasmni yuklashda xatolik yuz berdi. Qayta yuboring:');
    }
  });

  // Tasdiqlash
  scene.action('confirm_student', async (ctx) => {
    if (ctx.session.step !== 7) return;
    if (ctx.session.processing) return;
    ctx.session.processing = true;
    await ctx.answerCbQuery();

    try {
      await ctx.editMessageCaption(
        (ctx.callbackQuery.message as any)?.caption ?? '',
        Markup.inlineKeyboard([
          [Markup.button.callback('⏳ Yuklanmoqda...', 'noop')],
        ]),
      );
    } catch {
      // editMessage xatosi bo'lsa davom etamiz
    }
    await ctx.sendChatAction('typing');

    const data = ctx.session.data;
    const chatId = String(ctx.chat!.id);

    try {
      const { plainPassword } = await registerStudentFromTelegram(
        prisma,
        entityHistoryService,
        data,
        chatId,
      );

      ctx.session.processing = false;
      await ctx.editMessageCaption('✅ Tasdiqlandi!');
      await ctx.replyWithPhoto(data.photo, {
        caption:
          "✅ Ro'yxatdan muvaffaqiyatli o'tdingiz!\n\n" +
          `👨‍🏫 O'qituvchi: ${data.teacherName}\n` +
          `📚 Guruh: ${data.groupName}\n\n` +
          `🔐 Shaxsiy kabinetingiz:\n` +
          `🌐 student.dafzentrum.uz\n` +
          `📱 Login: ${data.phone}\n` +
          `🔑 Parol: ${plainPassword}\n\n` +
          'Tez orada sizga darslar haqida xabar beramiz!',
      });

      await ctx.scene.leave();
    } catch (error) {
      ctx.session.processing = false;
      logger.error("Ro'yxatdan o'tishda xatolik", error as Error);

      if (error?.code === 'P2002') {
        await ctx.reply(
          "Bu ma'lumotlar allaqachon tizimda mavjud. Administrator bilan bog'laning.",
        );
        await ctx.scene.leave();
        return;
      }

      ctx.session.step = 7;
      await ctx.reply(
        "Ro'yxatdan o'tishda xatolik yuz berdi. Qayta tasdiqlang yoki administrator bilan bog'laning.",
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Qayta tasdiqlash', 'confirm_student'),
            Markup.button.callback('🔄 Qayta kiritish', 'restart_student'),
          ],
        ]),
      );
    }
  });

  // Qayta kiritish
  scene.action('restart_student', async (ctx) => {
    if (ctx.session.step !== 7) return;
    if (ctx.session.processing) return;
    ctx.session.processing = true;
    await ctx.answerCbQuery();

    try {
      await ctx.editMessageCaption(
        (ctx.callbackQuery.message as any)?.caption ?? '',
        Markup.inlineKeyboard([
          [Markup.button.callback('⏳ Yuklanmoqda...', 'noop')],
        ]),
      );
    } catch {
      // editMessage xatosi bo'lsa davom etamiz
    }

    if (ctx.session.data.photo) {
      await uploadService.deleteFile(ctx.session.data.photo);
    }

    const branchId = ctx.session.data.branchId;
    ctx.session.data = { branchId };
    ctx.session.step = 1;
    ctx.session.processing = false;

    await ctx.editMessageCaption('🔄 Qayta kiritish tanlandi');

    const teachers = await loadTeachersForBranch(prisma, branchId);
    await ctx.reply(
      "O'qituvchingizni tanlang:",
      Markup.inlineKeyboard(buildTeachersKeyboard(teachers)),
    );
  });

  return scene;
}
