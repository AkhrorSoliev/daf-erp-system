import { Scenes, Markup, Telegraf } from 'telegraf';
import { BotContext } from '../types/context';
import { SCENES, DEFAULT_COMPANY_ID } from '../constants';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../upload/upload.service';
import { EntityHistoryService } from '../../common/entity-history';
import { message } from 'telegraf/filters';
import https from 'https';
import * as bcrypt from 'bcryptjs';

const STUDENT_ROLE_ID = 6;

function generatePassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function downloadFile(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });
}

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
  bot: Telegraf<BotContext>,
  entityHistoryService: EntityHistoryService,
): Scenes.BaseScene<BotContext> {
  const scene = new Scenes.BaseScene<BotContext>(SCENES.STUDENT_REGISTRATION);

  // Loading button bosilganda — hech narsa qilmaslik
  scene.action('noop', async (ctx) => {
    await ctx.answerCbQuery("Iltimos, kuting...");
  });

  // Scene ga kirganda — ustozlar ro'yxatini ko'rsatish
  scene.enter(async (ctx) => {
    const branchId = ctx.session.data?.branchId;
    if (!branchId) {
      await ctx.reply("Xatolik: filial aniqlanmadi. Qayta urinib ko'ring.");
      await ctx.scene.leave();
      return;
    }

    // Allaqachon ro'yxatdan o'tganini tekshirish
    const chatId = String(ctx.chat!.id);
    const existingStudent = await prisma.student.findFirst({
      where: { telegramChatId: chatId, deletedAt: null },
    });
    if (existingStudent) {
      await ctx.reply(
        "Siz allaqachon ro'yxatdan o'tgansiz!",
      );
      await ctx.scene.leave();
      return;
    }

    // QR kod orqali guruh bilan kelgan bo'lsa — to'g'ridan-to'g'ri ism kiritishga o'tish
    if (ctx.session.data.groupId) {
      ctx.session.step = 3;

      const daysMap: Record<string, string> = { odd: 'Toq kunlar', even: 'Juft kunlar' };
      const weekdayLabels: Record<string, string> = {
        monday: 'Du', tuesday: 'Se', wednesday: 'Cho',
        thursday: 'Pa', friday: 'Ju', saturday: 'Sha',
      };

      const d = ctx.session.data;
      const days = d.days ? daysMap[d.days] ?? '' : (d.exactDays?.length ? d.exactDays.map((day: string) => weekdayLabels[day] ?? day).join(', ') : '');
      const time = d.lessonStartTime && d.lessonEndTime ? `${d.lessonStartTime} – ${d.lessonEndTime}` : '';

      let info = `📚  ${d.groupName}\n`;
      info += `👨‍🏫  ${d.teacherName}\n`;
      if (days || time) info += `🕐  ${[days, time].filter(Boolean).join(' | ')}\n`;
      if (d.roomName) info += `🏫  ${d.roomName}\n`;

      await ctx.reply(
        `Assalomu alaykum!\nQuyidagi guruhga ro'yxatdan o'tish:\n\n${info}\nIsmingizni kiriting:`,
      );
      return;
    }

    ctx.session.step = 1;
    ctx.session.data = { branchId };

    await ctx.sendChatAction('typing');

    // Ushbu filialda dars beradigan ustozlarni olish
    const teachers = await prisma.user.findMany({
      where: {
        deletedAt: null,
        roles: { some: { roleId: 4 } },
        branches: { some: { branchId } },
      },
      select: { id: true, firstName: true, lastName: true, photo: true },
      orderBy: { firstName: 'asc' },
    });

    if (teachers.length === 0) {
      await ctx.reply("Hozirda ushbu filialda o'qituvchilar mavjud emas.");
      await ctx.scene.leave();
      return;
    }

    // Ustozlarni inline button sifatida ko'rsatish
    const buttons = teachers.map((t) => [
      Markup.button.callback(`${t.firstName} ${t.lastName}`, `select_teacher_${t.id}`),
    ]);

    await ctx.reply(
      "Assalomu alaykum! O'quvchi sifatida ro'yxatdan o'tish.\n\n" +
        "O'qituvchingizni tanlang:",
      Markup.inlineKeyboard(buttons),
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

    // Ustoz mavjudligini tekshirish
    const teacher = await prisma.user.findFirst({
      where: { id: teacherId, deletedAt: null, roles: { some: { roleId: 4 } } },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!teacher) {
      ctx.session.processing = false;
      await ctx.reply("O'qituvchi topilmadi. Qayta tanlang.");
      return;
    }

    ctx.session.data.teacherId = teacherId;
    ctx.session.data.teacherName = `${teacher.firstName} ${teacher.lastName}`;

    // Ushbu ustozning guruhlarini olish
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
      await ctx.editMessageText(`${teacher.firstName} ${teacher.lastName} — hozirda guruhlari mavjud emas.`);
      // Qayta ustozlar ro'yxatiga qaytarish
      ctx.session.step = 1;
      const teachers = await prisma.user.findMany({
        where: {
          deletedAt: null,
          roles: { some: { roleId: 4 } },
          branches: { some: { branchId } },
        },
        select: { id: true, firstName: true, lastName: true },
        orderBy: { firstName: 'asc' },
      });
      const buttons = teachers.map((t) => [
        Markup.button.callback(`${t.firstName} ${t.lastName}`, `select_teacher_${t.id}`),
      ]);
      await ctx.reply("Boshqa o'qituvchini tanlang:", Markup.inlineKeyboard(buttons));
      return;
    }

    ctx.session.step = 2;
    ctx.session.processing = false;

    const daysMap: Record<string, string> = { odd: 'Toq kunlar', even: 'Juft kunlar' };

    const buttons = groups.map((g) => {
      const time = g.lessonStartTime && g.lessonEndTime
        ? `${g.lessonStartTime}–${g.lessonEndTime}`
        : '';
      const days = g.days ? daysMap[g.days] ?? '' : '';
      const price = g.course.price.toLocaleString('en-US');
      const label = `${g.name} | ${days} ${time} | ${price} so'm`;
      return [Markup.button.callback(label, `select_group_${g.id}`)];
    });

    buttons.push([Markup.button.callback("⬅️ Orqaga", "back_to_teachers")]);

    await ctx.editMessageText(
      `👨‍🏫 ${teacher.firstName} ${teacher.lastName}\n\nGuruhni tanlang:`,
    );
    await ctx.reply("Quyidagi guruhlardan birini tanlang:", Markup.inlineKeyboard(buttons));
  });

  // Orqaga — ustozlar ro'yxatiga
  scene.action('back_to_teachers', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.step = 1;
    const branchId = ctx.session.data.branchId;

    const teachers = await prisma.user.findMany({
      where: {
        deletedAt: null,
        roles: { some: { roleId: 4 } },
        branches: { some: { branchId } },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    });

    const buttons = teachers.map((t) => [
      Markup.button.callback(`${t.firstName} ${t.lastName}`, `select_teacher_${t.id}`),
    ]);

    await ctx.editMessageText(
      "O'qituvchingizni tanlang:",
      Markup.inlineKeyboard(buttons),
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
      await ctx.reply("Guruh topilmadi. Qayta tanlang.");
      return;
    }

    ctx.session.data.groupId = groupId;
    ctx.session.data.groupName = group.name;
    ctx.session.step = 3;

    await ctx.editMessageText(
      `✅ Guruh tanlandi: ${group.name}`,
    );
    await ctx.reply("Ismingizni kiriting:");
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
        "Bekor qilindi. Qayta boshlash uchun /start bosing.",
        Markup.removeKeyboard(),
      );
      return;
    }

    // /start buyrug'i — scene'dan chiqib, boshidan boshlash
    if (text.startsWith('/start')) {
      if (ctx.session.data?.photo) {
        await uploadService.deleteFile(ctx.session.data.photo);
      }
      await ctx.scene.reenter();
      return;
    }

    switch (step) {
      // Ism
      case 3: {
        if (text.length < 2) {
          await ctx.reply("Ism kamida 2 belgidan iborat bo'lishi kerak. Qayta kiriting:");
          return;
        }
        ctx.session.data.firstName = text;
        ctx.session.step = 4;
        await ctx.reply("Familiyangizni kiriting:");
        break;
      }

      // Familiya
      case 4: {
        if (text.length < 2) {
          await ctx.reply("Familiya kamida 2 belgidan iborat bo'lishi kerak. Qayta kiriting:");
          return;
        }
        ctx.session.data.lastName = text;
        ctx.session.step = 5;
        await ctx.reply(
          "Telefon raqamingizni yuboring:",
          Markup.keyboard([
            [Markup.button.contactRequest("📱 Telefon raqamni yuborish")],
          ]).resize().oneTime(),
        );
        break;
      }

      // Telefon — text yuborilsa
      case 5: {
        await ctx.reply(
          "Iltimos, telefon raqamni quyidagi tugma orqali yuboring:",
          Markup.keyboard([
            [Markup.button.contactRequest("📱 Telefon raqamni yuborish")],
          ]).resize().oneTime(),
        );
        break;
      }

      // Rasm — text yuborilsa
      case 6: {
        await ctx.reply("Iltimos, rasmingizni yuboring (foto sifatida).");
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
    let phone = contact.phone_number;

    phone = phone.replace(/\D/g, '');
    if (phone.startsWith('998')) {
      phone = phone.slice(3);
    }

    if (phone.length !== 9) {
      await ctx.reply(
        "Telefon raqam noto'g'ri formatda. Qayta yuboring:",
        Markup.keyboard([
          [Markup.button.contactRequest("📱 Telefon raqamni yuborish")],
        ]).resize().oneTime(),
      );
      return;
    }

    // Bazada tekshirish
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
      "Rasmingizni yuboring (foto sifatida):",
      Markup.removeKeyboard(),
    );
  });

  // Rasm yuklash umumiy funksiya
  async function handlePhotoUpload(ctx: BotContext, fileId: string, mimetype: string) {
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
          Markup.button.callback("✅ Tasdiqlash", "confirm_student"),
          Markup.button.callback("🔄 Qayta kiritish", "restart_student"),
        ],
      ]),
    });
  }

  // Rasm qabul qilish (compressed photo)
  scene.on(message('photo'), async (ctx) => {
    if (ctx.session.step !== 6) return;
    if (ctx.session.processing) return;

    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1];

    try {
      await handlePhotoUpload(ctx, photo.file_id, 'image/jpeg');
    } catch {
      await ctx.reply("Rasmni yuklashda xatolik yuz berdi. Qayta yuboring:");
    }
  });

  // Rasm qabul qilish (document/fayl sifatida)
  scene.on(message('document'), async (ctx) => {
    if (ctx.session.step !== 6) return;
    if (ctx.session.processing) return;

    const doc = ctx.message.document;
    const mime = doc.mime_type || '';

    if (!mime.startsWith('image/')) {
      await ctx.reply("Iltimos, rasm formatidagi fayl yuboring (JPG, PNG).");
      return;
    }

    try {
      await handlePhotoUpload(ctx, doc.file_id, mime);
    } catch {
      await ctx.reply("Rasmni yuklashda xatolik yuz berdi. Qayta yuboring:");
    }
  });

  // Tasdiqlash
  scene.action('confirm_student', async (ctx) => {
    if (ctx.session.step !== 7) return;
    if (ctx.session.processing) return;
    ctx.session.processing = true;
    await ctx.answerCbQuery();

    // Buttonlarni loading holatiga o'zgartirish
    try {
      await ctx.editMessageCaption(
        (ctx.callbackQuery.message as any)?.caption ?? '',
        Markup.inlineKeyboard([
          [Markup.button.callback("\u23F3 Yuklanmoqda...", "noop")],
        ]),
      );
    } catch {
      // editMessage xatosi bo'lsa davom etamiz
    }
    await ctx.sendChatAction('typing');

    const data = ctx.session.data;
    const chatId = String(ctx.chat!.id);

    try {
      // Student yaratish
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

      // Tarix: O'quvchi yaratildi (Telegram bot orqali)
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

      // Guruhga enrollment qo'shish
      const enrollment = await prisma.enrollment.create({
        data: {
          studentId: student.id,
          groupId: data.groupId,
        },
      });

      // Tarix: Guruhga qo'shildi (Telegram bot orqali)
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

      // Tarix: Enrollment yaratildi
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

      // Tarix: Group entity — guruh tarix tabida ko'rinadi
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

      // Student uchun User yaratish (login/parol)
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

      ctx.session.processing = false;
      await ctx.editMessageCaption("✅ Tasdiqlandi!");
      await ctx.replyWithPhoto(data.photo, {
        caption:
          "✅ Ro'yxatdan muvaffaqiyatli o'tdingiz!\n\n" +
          `👨‍🏫 O'qituvchi: ${data.teacherName}\n` +
          `📚 Guruh: ${data.groupName}\n\n` +
          `🔐 Shaxsiy kabinetingiz:\n` +
          `🌐 student.dafzentrum.uz\n` +
          `📱 Login: ${data.phone}\n` +
          `🔑 Parol: ${plainPassword}\n\n` +
          "Tez orada sizga darslar haqida xabar beramiz!",
      });

      await ctx.scene.leave();
    } catch (error) {
      ctx.session.processing = false;
      console.error('[StudentRegistration] Ro\'yxatdan o\'tishda xatolik:', error);

      // Duplicate phone/login xatoligi
      if (error?.code === 'P2002') {
        await ctx.reply(
          "Bu ma'lumotlar allaqachon tizimda mavjud. Administrator bilan bog'laning.",
        );
        await ctx.scene.leave();
        return;
      }

      // Boshqa xatolikda — qayta urinish imkoni
      ctx.session.step = 7;
      await ctx.reply(
        "Ro'yxatdan o'tishda xatolik yuz berdi. Qayta tasdiqlang yoki administrator bilan bog'laning.",
        Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Qayta tasdiqlash", "confirm_student"),
            Markup.button.callback("🔄 Qayta kiritish", "restart_student"),
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

    // Buttonlarni loading holatiga o'zgartirish
    try {
      await ctx.editMessageCaption(
        (ctx.callbackQuery.message as any)?.caption ?? '',
        Markup.inlineKeyboard([
          [Markup.button.callback("\u23F3 Yuklanmoqda...", "noop")],
        ]),
      );
    } catch {
      // editMessage xatosi bo'lsa davom etamiz
    }

    // Yuklangan rasmni o'chirish
    if (ctx.session.data.photo) {
      await uploadService.deleteFile(ctx.session.data.photo);
    }

    const branchId = ctx.session.data.branchId;
    ctx.session.data = { branchId };
    ctx.session.step = 1;
    ctx.session.processing = false;

    await ctx.editMessageCaption("🔄 Qayta kiritish tanlandi");

    // Ustozlar ro'yxatini qayta ko'rsatish
    const teachers = await prisma.user.findMany({
      where: {
        deletedAt: null,
        roles: { some: { roleId: 4 } },
        branches: { some: { branchId } },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    });

    const buttons = teachers.map((t) => [
      Markup.button.callback(`${t.firstName} ${t.lastName}`, `select_teacher_${t.id}`),
    ]);

    await ctx.reply("O'qituvchingizni tanlang:", Markup.inlineKeyboard(buttons));
  });

  return scene;
}
