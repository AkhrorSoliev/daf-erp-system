import { Scenes, Markup, Telegraf } from 'telegraf';
import { BotContext } from '../types/context';
import { SCENES, TEACHER_ROLE_ID, DEFAULT_COMPANY_ID } from '../constants';
import { generateUniqueLogin, generatePassword } from '../utils/login-generator';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../upload/upload.service';
import { UsersService } from '../../users/users.service';
import { message } from 'telegraf/filters';
import https from 'https';

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

export function createTeacherRegistrationScene(
  prisma: PrismaService,
  uploadService: UploadService,
  usersService: UsersService,
  bot: Telegraf<BotContext>,
): Scenes.BaseScene<BotContext> {
  const scene = new Scenes.BaseScene<BotContext>(SCENES.TEACHER_REGISTRATION);

  // Scene ga kirganda
  scene.enter(async (ctx) => {
    // Allaqachon ro'yxatdan o'tganini tekshirish
    const chatId = String(ctx.chat!.id);
    const existing = await prisma.user.findFirst({
      where: { telegramChatId: chatId, deletedAt: null },
    });

    if (existing) {
      await ctx.reply(
        "Siz allaqachon ro'yxatdan o'tgansiz! Platformaga kirish uchun login va parolingizdan foydalaning.",
      );
      await ctx.scene.leave();
      return;
    }

    ctx.session.step = 1;
    const branchId = ctx.session.data?.branchId;
    ctx.session.data = { branchId };
    await ctx.reply(
      "Assalomu alaykum! O'qituvchi sifatida ro'yxatdan o'tish.\n\n" +
        "Ismingizni kiriting:",
    );
  });

  // Barcha text xabarlari
  scene.on(message('text'), async (ctx) => {
    const step = ctx.session.step;
    const text = ctx.message.text.trim();

    // /cancel buyrug'i
    if (text === '/cancel') {
      await ctx.scene.leave();
      await ctx.reply(
        "Bekor qilindi. Qayta boshlash uchun /start bosing.",
        Markup.removeKeyboard(),
      );
      return;
    }

    switch (step) {
      // Ism kiritish
      case 1: {
        if (text.length < 2) {
          await ctx.reply("Ism kamida 2 belgidan iborat bo'lishi kerak. Qayta kiriting:");
          return;
        }
        ctx.session.data.firstName = text;
        ctx.session.step = 2;
        await ctx.reply("Familiyangizni kiriting:");
        break;
      }

      // Familiya kiritish
      case 2: {
        if (text.length < 2) {
          await ctx.reply("Familiya kamida 2 belgidan iborat bo'lishi kerak. Qayta kiriting:");
          return;
        }
        ctx.session.data.lastName = text;
        ctx.session.step = 3;
        await ctx.reply(
          "Telefon raqamingizni yuboring:",
          Markup.keyboard([
            [Markup.button.contactRequest("\uD83D\uDCF1 Telefon raqamni yuborish")],
          ]).resize().oneTime(),
        );
        break;
      }

      // Telefon raqam (text yuborilsa xatolik)
      case 3: {
        await ctx.reply(
          "Iltimos, telefon raqamni quyidagi tugma orqali yuboring:",
          Markup.keyboard([
            [Markup.button.contactRequest("\uD83D\uDCF1 Telefon raqamni yuborish")],
          ]).resize().oneTime(),
        );
        break;
      }

      // Jins tanlash (text yuborilsa xatolik)
      case 4: {
        await ctx.reply(
          "Iltimos, quyidagi tugmalardan birini tanlang:",
          Markup.inlineKeyboard([
            [
              Markup.button.callback("\uD83D\uDC68 Erkak", "gender_male"),
              Markup.button.callback("\uD83D\uDC69 Ayol", "gender_female"),
            ],
          ]),
        );
        break;
      }

      // Rasm (text yuborilsa xatolik)
      case 5: {
        await ctx.reply("Iltimos, rasmingizni yuboring (foto sifatida).");
        break;
      }

      default:
        break;
    }
  });

  // Contact share
  scene.on(message('contact'), async (ctx) => {
    if (ctx.session.step !== 3) return;

    const contact = ctx.message.contact;
    let phone = contact.phone_number;

    // +998 ni olib tashlash, faqat 9 raqam qoldirish
    phone = phone.replace(/\D/g, '');
    if (phone.startsWith('998')) {
      phone = phone.slice(3);
    }

    if (phone.length !== 9) {
      await ctx.reply(
        "Telefon raqam noto'g'ri formatda. Qayta yuboring:",
        Markup.keyboard([
          [Markup.button.contactRequest("\uD83D\uDCF1 Telefon raqamni yuborish")],
        ]).resize().oneTime(),
      );
      return;
    }

    // Telefon raqam bazada mavjudligini tekshirish
    const existingUser = await prisma.user.findFirst({
      where: { phone },
    });
    if (existingUser) {
      await ctx.reply(
        "Bu telefon raqam allaqachon tizimda ro'yxatdan o'tgan. " +
          "Muammo bo'lsa administrator bilan bog'laning.",
        Markup.removeKeyboard(),
      );
      await ctx.scene.leave();
      return;
    }

    ctx.session.data.phone = phone;
    ctx.session.step = 4;
    await ctx.reply(
      "Jinsingizni tanlang:",
      Markup.removeKeyboard(),
    );
    await ctx.reply(
      "Quyidagi tugmalardan birini bosing:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("\uD83D\uDC68 Erkak", "gender_male"),
          Markup.button.callback("\uD83D\uDC69 Ayol", "gender_female"),
        ],
      ]),
    );
  });

  // Jins tanlash callback
  scene.action('gender_male', async (ctx) => {
    if (ctx.session.step !== 4) return;
    await ctx.answerCbQuery();
    ctx.session.data.gender = 'MALE';
    ctx.session.step = 5;
    await ctx.editMessageText("\uD83D\uDC68 Erkak tanlandi");
    await ctx.reply("Rasmingizni yuboring (foto sifatida):");
  });

  scene.action('gender_female', async (ctx) => {
    if (ctx.session.step !== 4) return;
    await ctx.answerCbQuery();
    ctx.session.data.gender = 'FEMALE';
    ctx.session.step = 5;
    await ctx.editMessageText("\uD83D\uDC69 Ayol tanlandi");
    await ctx.reply("Rasmingizni yuboring (foto sifatida):");
  });

  // Rasm yuklash umumiy funksiya
  async function handlePhotoUpload(ctx: BotContext, fileId: string, mimetype: string) {
    await ctx.sendChatAction('upload_photo');

    const fileLink = await ctx.telegram.getFileLink(fileId);
    const buffer = await downloadFile(fileLink.href);

    const ext = mimetype === 'image/png' ? '.png' : '.jpg';
    const multerFile = {
      originalname: `teacher_${ctx.chat!.id}${ext}`,
      buffer,
      mimetype,
    } as Express.Multer.File;

    const photoUrl = await uploadService.uploadFile(multerFile, 'teachers');
    ctx.session.data.photo = photoUrl;
    ctx.session.step = 6;

    const data = ctx.session.data;
    await ctx.replyWithPhoto(photoUrl, {
      caption:
        "\uD83D\uDCCB Ma'lumotlaringizni tekshiring:\n\n" +
        `\uD83D\uDC64 Ism: ${data.firstName}\n` +
        `\uD83D\uDC64 Familiya: ${data.lastName}\n` +
        `\uD83D\uDCDE Telefon: +998 ${data.phone}\n` +
        `\uD83D\uDC65 Jins: ${data.gender === 'MALE' ? 'Erkak' : 'Ayol'}`,
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("\u2705 Tasdiqlash", "confirm_registration"),
          Markup.button.callback("\uD83D\uDD04 Qayta kiritish", "restart_registration"),
        ],
      ]),
    });
  }

  // Rasm qabul qilish (compressed photo)
  scene.on(message('photo'), async (ctx) => {
    if (ctx.session.step !== 5) return;

    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1];

    try {
      await handlePhotoUpload(ctx, photo.file_id, 'image/jpeg');
    } catch (error) {
      await ctx.reply("Rasmni yuklashda xatolik yuz berdi. Qayta yuboring:");
    }
  });

  // Rasm qabul qilish (document/fayl sifatida)
  scene.on(message('document'), async (ctx) => {
    if (ctx.session.step !== 5) return;

    const doc = ctx.message.document;
    const mime = doc.mime_type || '';

    if (!mime.startsWith('image/')) {
      await ctx.reply("Iltimos, rasm formatidagi fayl yuboring (JPG, PNG).");
      return;
    }

    try {
      await handlePhotoUpload(ctx, doc.file_id, mime);
    } catch (error) {
      await ctx.reply("Rasmni yuklashda xatolik yuz berdi. Qayta yuboring:");
    }
  });

  // Tasdiqlash
  scene.action('confirm_registration', async (ctx) => {
    if (ctx.session.step !== 6) return;
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');

    const data = ctx.session.data;
    const chatId = String(ctx.chat!.id);

    try {
      // Login va parol generatsiya
      const login = await generateUniqueLogin(
        data.firstName,
        data.lastName,
        prisma,
      );
      const password = generatePassword();

      // User yaratish
      await usersService.create({
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        photo: data.photo,
        gender: data.gender,
        login,
        password,
        companyId: DEFAULT_COMPANY_ID,
        mainBranch: data.branchId ?? undefined,
        telegramChatId: chatId,
        roleIds: [TEACHER_ROLE_ID],
        branchIds: data.branchId ? [data.branchId] : undefined,
      });

      await ctx.editMessageCaption("\u2705 Tasdiqlandi!");
      await ctx.replyWithPhoto(data.photo, {
        caption:
          "\u2705 Ro'yxatdan muvaffaqiyatli o'tdingiz!\n\n" +
          `\uD83D\uDC64 Sizning login: \`${login}\`\n` +
          `\uD83D\uDD11 Sizning parol: \`${password}\`\n\n` +
          "\u26A0\uFE0F Login va parolni eslab qoling yoki saqlang!\n\n" +
          "Tez orada o'qituvchilar uchun platforma ishga tushadi.\n" +
          "Sizga xabar beramiz!",
        parse_mode: 'Markdown',
      });

      await ctx.scene.leave();
    } catch (error) {
      await ctx.reply(
        "Ro'yxatdan o'tishda xatolik yuz berdi. Iltimos, qayta urinib ko'ring yoki administrator bilan bog'laning.",
      );
      await ctx.scene.leave();
    }
  });

  // Qayta kiritish
  scene.action('restart_registration', async (ctx) => {
    if (ctx.session.step !== 6) return;
    await ctx.answerCbQuery();

    // Yuklangan rasmni o'chirish
    if (ctx.session.data.photo) {
      await uploadService.deleteFile(ctx.session.data.photo);
    }

    ctx.session.step = 1;
    const branchId = ctx.session.data?.branchId;
    ctx.session.data = { branchId };
    await ctx.editMessageText("\uD83D\uDD04 Qayta kiritish tanlandi");
    await ctx.reply("Ismingizni kiriting:");
  });

  return scene;
}
