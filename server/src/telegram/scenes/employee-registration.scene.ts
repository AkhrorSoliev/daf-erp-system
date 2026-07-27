import { Scenes, Markup, Telegraf } from 'telegraf';
import { BotContext } from '../types/context';
import { SCENES, DEFAULT_COMPANY_ID } from '../constants';
import {
  ASK_FIRST_NAME,
  ASK_LAST_NAME,
  FIRST_NAME_TOO_SHORT,
  LAST_NAME_TOO_SHORT,
  MULTI_WORD_NAME_HINT,
  looksLikeFullName,
} from '../name-prompts';
import {
  generateUniqueLogin,
  generatePassword,
} from '../utils/login-generator';
import { downloadFile } from '../utils/download.util';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../upload/upload.service';
import { UsersService } from '../../users/users.service';
import { message } from 'telegraf/filters';

const ROLE_LABELS: Record<number, string> = {
  1: 'CEO',
  2: 'Direktor',
  3: 'Administrator',
  4: "O'qituvchi",
  5: 'Kassir',
};

function roleNamesText(roleIds: number[]): string {
  return roleIds.map((id) => ROLE_LABELS[id] ?? `#${id}`).join(', ');
}

export function createEmployeeRegistrationScene(
  prisma: PrismaService,
  uploadService: UploadService,
  usersService: UsersService,
  _bot: Telegraf<BotContext>,
): Scenes.BaseScene<BotContext> {
  const scene = new Scenes.BaseScene<BotContext>(SCENES.EMPLOYEE_REGISTRATION);

  scene.action('noop', async (ctx) => {
    await ctx.answerCbQuery('Iltimos, kuting...');
  });

  scene.enter(async (ctx) => {
    const chatId = String(ctx.chat!.id);
    const existing = await prisma.user.findFirst({
      where: { telegramChatId: chatId, deletedAt: null },
    });

    if (existing) {
      await ctx.reply(
        "Siz allaqachon ro'yxatdan o'tgansiz\\!\n\n" +
          'Platformaga kirish uchun login va parolingizdan foydalaning:\n' +
          '[admin\\.dafzentrum\\.uz](https://admin.dafzentrum.uz)',
        { parse_mode: 'MarkdownV2' },
      );
      await ctx.scene.leave();
      return;
    }

    ctx.session.step = 1;
    const branchId = ctx.session.data?.branchId;
    const roleIds: number[] = ctx.session.data?.roleIds ?? [];
    ctx.session.data = { branchId, roleIds };

    await ctx.reply(
      `Assalomu alaykum! Xodim sifatida ro'yxatdan o'tish.\n\n` +
        `Tanlangan lavozim(lar): ${roleNamesText(roleIds)}\n\n` +
        ASK_FIRST_NAME,
    );
  });

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
      case 1: {
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
        ctx.session.step = 2;
        await ctx.reply(ASK_LAST_NAME);
        break;
      }

      case 2: {
        if (text.length < 2) {
          await ctx.reply(LAST_NAME_TOO_SHORT);
          return;
        }
        ctx.session.data.lastName = text;
        ctx.session.step = 3;
        await ctx.reply(
          'Telefon raqamingizni yuboring:',
          Markup.keyboard([
            [
              Markup.button.contactRequest(
                '\uD83D\uDCF1 Telefon raqamni yuborish',
              ),
            ],
          ])
            .resize()
            .oneTime(),
        );
        break;
      }

      case 3: {
        await ctx.reply(
          'Iltimos, telefon raqamni quyidagi tugma orqali yuboring:',
          Markup.keyboard([
            [
              Markup.button.contactRequest(
                '\uD83D\uDCF1 Telefon raqamni yuborish',
              ),
            ],
          ])
            .resize()
            .oneTime(),
        );
        break;
      }

      case 4: {
        await ctx.reply(
          'Iltimos, quyidagi tugmalardan birini tanlang:',
          Markup.inlineKeyboard([
            [
              Markup.button.callback('\uD83D\uDC68 Erkak', 'gender_male'),
              Markup.button.callback('\uD83D\uDC69 Ayol', 'gender_female'),
            ],
          ]),
        );
        break;
      }

      case 5: {
        await ctx.reply('Iltimos, rasmingizni yuboring (foto sifatida).');
        break;
      }

      default:
        break;
    }
  });

  scene.on(message('contact'), async (ctx) => {
    if (ctx.session.step !== 3) return;
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
          [
            Markup.button.contactRequest(
              '\uD83D\uDCF1 Telefon raqamni yuborish',
            ),
          ],
        ])
          .resize()
          .oneTime(),
      );
      return;
    }

    const existingUser = await prisma.user.findFirst({ where: { phone } });
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
    await ctx.reply('Jinsingizni tanlang:', Markup.removeKeyboard());
    await ctx.reply(
      'Quyidagi tugmalardan birini bosing:',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('\uD83D\uDC68 Erkak', 'gender_male'),
          Markup.button.callback('\uD83D\uDC69 Ayol', 'gender_female'),
        ],
      ]),
    );
  });

  scene.action('gender_male', async (ctx) => {
    if (ctx.session.step !== 4) return;
    await ctx.answerCbQuery();
    ctx.session.data.gender = 'MALE';
    ctx.session.step = 5;
    await ctx.editMessageText('\uD83D\uDC68 Erkak tanlandi');
    await ctx.reply('Rasmingizni yuboring (foto sifatida):');
  });

  scene.action('gender_female', async (ctx) => {
    if (ctx.session.step !== 4) return;
    await ctx.answerCbQuery();
    ctx.session.data.gender = 'FEMALE';
    ctx.session.step = 5;
    await ctx.editMessageText('\uD83D\uDC69 Ayol tanlandi');
    await ctx.reply('Rasmingizni yuboring (foto sifatida):');
  });

  async function handlePhotoUpload(
    ctx: BotContext,
    fileId: string,
    mimetype: string,
  ) {
    await ctx.sendChatAction('upload_photo');

    const fileLink = await ctx.telegram.getFileLink(fileId);
    const buffer = await downloadFile(fileLink.href);

    const ext = mimetype === 'image/png' ? '.png' : '.jpg';
    const multerFile = {
      originalname: `employee_${ctx.chat!.id}${ext}`,
      buffer,
      mimetype,
    } as Express.Multer.File;

    const photoUrl = await uploadService.uploadFile(multerFile, 'employees');
    ctx.session.data.photo = photoUrl;
    ctx.session.step = 6;

    const data = ctx.session.data;
    await ctx.replyWithPhoto(photoUrl, {
      caption:
        "\uD83D\uDCCB Ma'lumotlaringizni tekshiring:\n\n" +
        `\uD83D\uDC64 Ism: ${data.firstName}\n` +
        `\uD83D\uDC64 Familiya: ${data.lastName}\n` +
        `\uD83D\uDCDE Telefon: +998 ${data.phone}\n` +
        `\uD83D\uDC65 Jins: ${data.gender === 'MALE' ? 'Erkak' : 'Ayol'}\n` +
        `\uD83D\uDCBC Lavozim(lar): ${roleNamesText(data.roleIds ?? [])}`,
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('\u2705 Tasdiqlash', 'confirm_registration'),
          Markup.button.callback(
            '\uD83D\uDD04 Qayta kiritish',
            'restart_registration',
          ),
        ],
      ]),
    });
  }

  scene.on(message('photo'), async (ctx) => {
    if (ctx.session.step !== 5) return;
    if (ctx.session.processing) return;

    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1];

    try {
      await handlePhotoUpload(ctx, photo.file_id, 'image/jpeg');
    } catch {
      await ctx.reply('Rasmni yuklashda xatolik yuz berdi. Qayta yuboring:');
    }
  });

  scene.on(message('document'), async (ctx) => {
    if (ctx.session.step !== 5) return;
    if (ctx.session.processing) return;

    const doc = ctx.message.document;
    const mime = doc.mime_type || '';

    if (!mime.startsWith('image/')) {
      await ctx.reply('Iltimos, rasm formatidagi fayl yuboring (JPG, PNG).');
      return;
    }

    try {
      await handlePhotoUpload(ctx, doc.file_id, mime);
    } catch {
      await ctx.reply('Rasmni yuklashda xatolik yuz berdi. Qayta yuboring:');
    }
  });

  scene.action('confirm_registration', async (ctx) => {
    if (ctx.session.step !== 6) return;
    if (ctx.session.processing) return;
    ctx.session.processing = true;
    await ctx.answerCbQuery();

    try {
      await ctx.editMessageCaption(
        (ctx.callbackQuery.message as any)?.caption ?? '',
        Markup.inlineKeyboard([
          [Markup.button.callback('\u23F3 Yuklanmoqda...', 'noop')],
        ]),
      );
    } catch {
      // ignore
    }
    await ctx.sendChatAction('typing');

    const data = ctx.session.data;
    const chatId = String(ctx.chat!.id);
    const roleIds: number[] =
      Array.isArray(data.roleIds) && data.roleIds.length > 0
        ? data.roleIds
        : [];

    if (roleIds.length === 0) {
      ctx.session.processing = false;
      await ctx.reply("Lavozim belgilanmagan. Administrator bilan bog'laning.");
      await ctx.scene.leave();
      return;
    }

    try {
      const login = await generateUniqueLogin(
        data.firstName,
        data.lastName,
        prisma,
      );
      const password = generatePassword();

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
        roleIds,
        branchIds: data.branchId ? [data.branchId] : undefined,
      });

      ctx.session.processing = false;

      const isTeacherOnly = roleIds.length === 1 && roleIds[0] === 4;
      const portalUrl = isTeacherOnly
        ? 'https://lehrer.dafzentrum.uz'
        : 'https://admin.dafzentrum.uz';

      await ctx.editMessageCaption('\u2705 Tasdiqlandi!');
      await ctx.replyWithPhoto(data.photo, {
        caption:
          "\u2705 Ro'yxatdan muvaffaqiyatli o'tdingiz!\n\n" +
          `\uD83D\uDC64 Sizning login: \`${login}\`\n` +
          `\uD83D\uDD11 Sizning parol: \`${password}\`\n\n` +
          '\uD83C\uDF10 Platformaga kirish:\n' +
          `[${portalUrl.replace('https://', '')}](${portalUrl})\n\n` +
          '\u26A0\uFE0F Login va parolni eslab qoling yoki saqlang!',
        parse_mode: 'Markdown',
      });

      await ctx.scene.leave();
    } catch {
      ctx.session.processing = false;
      await ctx.reply(
        "Ro'yxatdan o'tishda xatolik yuz berdi. Iltimos, qayta urinib ko'ring yoki administrator bilan bog'laning.",
      );
      await ctx.scene.leave();
    }
  });

  scene.action('restart_registration', async (ctx) => {
    if (ctx.session.step !== 6) return;
    if (ctx.session.processing) return;
    ctx.session.processing = true;
    await ctx.answerCbQuery();

    try {
      await ctx.editMessageCaption(
        (ctx.callbackQuery.message as any)?.caption ?? '',
        Markup.inlineKeyboard([
          [Markup.button.callback('\u23F3 Yuklanmoqda...', 'noop')],
        ]),
      );
    } catch {
      // ignore
    }

    if (ctx.session.data.photo) {
      await uploadService.deleteFile(ctx.session.data.photo);
    }

    ctx.session.step = 1;
    const branchId = ctx.session.data?.branchId;
    const roleIds = ctx.session.data?.roleIds ?? [];
    ctx.session.data = { branchId, roleIds };
    ctx.session.processing = false;
    await ctx.editMessageCaption('\uD83D\uDD04 Qayta kiritish tanlandi');
    await ctx.reply(ASK_FIRST_NAME);
  });

  return scene;
}
