import { Gender } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../../common/entity-history';
import { tashkentDateStr } from '../../common/date/tashkent';
import { birthDateProblem } from '../../students/shared/student-onboarding';
import {
  ProfileInput,
  ProfileTarget,
  fillStudentProfile,
} from '../../students/shared/fill-student-profile';
import {
  PickerScreen,
  daysScreen,
  decadeStarts,
  decadesScreen,
  genderScreen,
  isRealIsoDate,
  monthsScreen,
  retryKeyboard,
  reviewScreen,
  validYearRange,
  yearsScreen,
} from './profile-date-picker';
import {
  ALREADY_FILLED,
  GenderChoice,
  NOT_YOURS,
  PREVIEW_NOTE,
  PREVIEW_STUDENT_ID,
  ProfileAction,
  THANKS,
  buildRequestKeyboard,
  buildRequestText,
  missingProfileFields,
} from './profile-request-text';

export interface ProfileCtx {
  chat?: { id: number | string };
  reply(text: string, extra?: any): Promise<unknown>;
  editMessageText(text: string, extra?: any): Promise<unknown>;
  answerCbQuery(text?: string): Promise<unknown>;
}

export interface ProfileDeps {
  prisma: PrismaService;
  entityHistory: EntityHistoryService;
}

type OwnedCard = ProfileTarget & { firstName: string };

const NO_KEYBOARD = { reply_markup: { inline_keyboard: [] } };
const PREVIEW_NAME = 'Aziz';

/** Bir xil matnni qayta yozish Telegramda xato beradi; faqat shuni yutamiz. */
async function edit(
  ctx: ProfileCtx,
  text: string,
  extra: object = NO_KEYBOARD,
) {
  try {
    await ctx.editMessageText(text, extra);
  } catch (e) {
    if (!/message is not modified/i.test(String((e as Error)?.message))) {
      throw e;
    }
  }
}

const show = (ctx: ProfileCtx, s: PickerScreen) =>
  edit(ctx, s.text, { reply_markup: s.keyboard.reply_markup });

/**
 * Karta SHU chatga bog'langan bo'lsagina qaytadi. Tugma ichidagi `studentId`
 * ga ishonilmaydi: begona chat boshqa o'quvchining kartasini o'zgartira olmasin.
 */
async function loadOwned(
  deps: ProfileDeps,
  ctx: ProfileCtx,
  studentId: number,
): Promise<OwnedCard | null> {
  if (!ctx.chat) return null;
  return deps.prisma.student.findFirst({
    where: {
      id: studentId,
      deletedAt: null,
      telegramChatId: String(ctx.chat.id),
    },
    select: {
      id: true,
      firstName: true,
      gender: true,
      dateOfBirth: true,
      companyId: true,
      userId: true,
    },
  });
}

/** Tugmadagi qiymat kalendarga va tanlash mumkin oraliqqa to'g'ri keladimi. */
function paramsValid(a: ProfileAction, today: string): boolean {
  const { min, max } = validYearRange(today);
  const inRange = (y: number) => y >= min && y <= max;
  switch (a.kind) {
    case 'decade':
      return decadeStarts(today).includes(a.decade);
    case 'year':
      return inRange(a.year);
    case 'month':
      return inRange(a.year) && a.month >= 1 && a.month <= 12;
    case 'review':
      return isRealIsoDate(a.iso) && inRange(Number(a.iso.slice(0, 4)));
    case 'save':
      return (
        a.iso === null ||
        (isRealIsoDate(a.iso) && inRange(Number(a.iso.slice(0, 4))))
      );
    default:
      return true;
  }
}

const GENDER_ENUM = { M: Gender.MALE, F: Gender.FEMALE } as const;

/** Saqlash: faqat kartada hali bo'sh VA tugmada bor maydonlar, bitta chaqiruv bilan. */
/** Birinchi savol: jins yo'q bo'lsa jins, aks holda yil. */
function firstScreen(
  id: number,
  hasGender: boolean,
  today: string,
): PickerScreen {
  return hasGender ? decadesScreen(id, 'N', today) : genderScreen(id);
}

async function save(
  deps: ProfileDeps,
  ctx: ProfileCtx,
  student: OwnedCard,
  g: GenderChoice,
  iso: string | null,
  today: string,
): Promise<void> {
  const input: ProfileInput = {};
  if (g !== 'N' && !student.gender) input.gender = GENDER_ENUM[g];
  if (iso && !student.dateOfBirth) input.dateOfBirth = iso;
  if (!input.gender && !input.dateOfBirth) {
    // Tugma kartada yetishmayotgan narsani olib kelmagan: hech narsa yozilmadi.
    return show(ctx, firstScreen(student.id, !!student.gender, today));
  }
  if (input.dateOfBirth) {
    const problem = birthDateProblem(input.dateOfBirth, today);
    if (problem) {
      return edit(ctx, `${problem}. Qaytadan tanlang.`, {
        reply_markup: retryKeyboard(student.id).reply_markup,
      });
    }
  }
  await fillStudentProfile(deps, student, input, student.userId ?? undefined);
  // Rahmat faqat hech narsa yetishmay qolganda; aks holda keyingi savol.
  const hasGender = !!(student.gender ?? input.gender);
  const hasDate = !!(student.dateOfBirth ?? input.dateOfBirth);
  if (hasGender && hasDate) return edit(ctx, THANKS);
  return show(ctx, firstScreen(student.id, hasGender, today));
}

export async function handleProfileTap(
  deps: ProfileDeps,
  ctx: ProfileCtx,
  action: ProfileAction,
  today: string = tashkentDateStr(new Date()),
): Promise<void> {
  if (!paramsValid(action, today)) {
    await ctx.answerCbQuery();
    return;
  }
  const id = action.studentId;

  // 0 — faqat ko'rinish belgisi: bazaga tegmaydi, ikkala maydon ham yetishmaydi deb olinadi.
  let student: OwnedCard | null = null;
  if (id !== PREVIEW_STUDENT_ID) {
    student = await loadOwned(deps, ctx, id);
    if (!student) {
      await ctx.answerCbQuery(NOT_YOURS);
      return;
    }
  }
  await ctx.answerCbQuery();

  const missing = student
    ? missingProfileFields(student)
    : (['gender', 'dateOfBirth'] as const);
  if (missing.length === 0) {
    return edit(ctx, ALREADY_FILLED);
  }
  const needsDate = missing.includes('dateOfBirth');

  switch (action.kind) {
    case 'cancel':
      // So'rovning o'ziga qaytadi: tugma yana shu yerda.
      return edit(ctx, buildRequestText(student?.firstName ?? PREVIEW_NAME), {
        parse_mode: 'HTML',
        reply_markup: buildRequestKeyboard(student ? student.id : 'preview')
          .reply_markup,
      });
    case 'start':
      return show(ctx, firstScreen(id, !missing.includes('gender'), today));
    case 'gender':
      // Jins oraliqda to'ldirilgan bo'lsa, yozilmaydi: so'rov faqat sanani davom ettiradi.
      if (!missing.includes('gender')) {
        return show(ctx, decadesScreen(id, 'N', today));
      }
      return show(
        ctx,
        needsDate
          ? decadesScreen(id, action.gender, today)
          : reviewScreen(id, action.gender, null),
      );
    case 'decades':
    case 'decade':
    case 'year':
    case 'month':
      // Sana oraliqda to'ldirilgan bo'lsa, sana ekranlari kerak emas.
      if (!needsDate) {
        return show(ctx, firstScreen(id, !missing.includes('gender'), today));
      }
      if (action.kind === 'decades') {
        return show(ctx, decadesScreen(id, action.g, today));
      }
      if (action.kind === 'decade') {
        return show(ctx, yearsScreen(id, action.g, action.decade, today));
      }
      if (action.kind === 'year') {
        return show(ctx, monthsScreen(id, action.g, action.year));
      }
      return show(ctx, daysScreen(id, action.g, action.year, action.month));
    case 'review': {
      // Faqat haqiqatan yoziladigan narsa ko'rsatiladi.
      const g = missing.includes('gender') ? action.g : 'N';
      const iso = needsDate ? action.iso : null;
      if (g === 'N' && !iso) return show(ctx, firstScreen(id, false, today));
      return show(ctx, reviewScreen(id, g, iso));
    }
    case 'save':
      // Ko'rinish rejimida hech narsa yozilmaydi.
      if (!student) return edit(ctx, PREVIEW_NOTE);
      return save(deps, ctx, student, action.g, action.iso, today);
  }
}
