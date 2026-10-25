import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../../common/entity-history';
import { tashkentDateStr } from '../../common/date/tashkent';
import { birthDateProblem } from '../../students/shared/student-onboarding';
import {
  ProfileTarget,
  fillStudentProfile,
} from '../../students/shared/fill-student-profile';
import {
  PickerScreen,
  YEAR_PROMPT,
  confirmScreen,
  daysScreen,
  decadeStarts,
  decadesScreen,
  isRealIsoDate,
  monthsScreen,
  retryKeyboard,
  validYearRange,
  yearsScreen,
} from './profile-date-picker';
import {
  ALREADY_FILLED,
  CANCELLED,
  DATE_SAVED,
  ProfileField,
  buildRequestKeyboard,
  missingProfileFields,
  GENDER_SAVED,
  NOT_YOURS,
  PREVIEW_NOTE,
  PREVIEW_STUDENT_ID,
  ProfileAction,
  THANKS,
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

const NO_KEYBOARD = { reply_markup: { inline_keyboard: [] } };

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

const show = (ctx: ProfileCtx, s: PickerScreen, prefix = '') =>
  edit(ctx, prefix + s.text, { reply_markup: s.keyboard.reply_markup });

/**
 * Karta SHU chatga bog'langan bo'lsagina qaytadi. Tugma ichidagi `studentId`
 * ga ishonilmaydi: begona chat boshqa o'quvchining kartasini o'zgartira olmasin.
 */
async function loadOwned(
  deps: ProfileDeps,
  ctx: ProfileCtx,
  studentId: number,
): Promise<ProfileTarget | null> {
  if (!ctx.chat) return null;
  return deps.prisma.student.findFirst({
    where: {
      id: studentId,
      deletedAt: null,
      telegramChatId: String(ctx.chat.id),
    },
    select: {
      id: true,
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
  switch (a.kind) {
    case 'decade':
      return decadeStarts(today).includes(a.decade);
    case 'year':
      return a.year >= min && a.year <= max;
    case 'month':
      return a.year >= min && a.year <= max && a.month >= 1 && a.month <= 12;
    case 'confirm':
    case 'save':
      return (
        isRealIsoDate(a.iso) &&
        Number(a.iso.slice(0, 4)) >= min &&
        Number(a.iso.slice(0, 4)) <= max
      );
    default:
      return true;
  }
}

type PickerAction = Extract<
  ProfileAction,
  {
    kind: 'date' | 'decade' | 'year' | 'month' | 'confirm' | 'save' | 'cancel';
  }
>;

async function handlePicker(
  deps: ProfileDeps,
  ctx: ProfileCtx,
  a: PickerAction,
  today: string,
): Promise<void> {
  const id = a.studentId;
  let student: ProfileTarget | null = null;
  if (id !== PREVIEW_STUDENT_ID) {
    student = await loadOwned(deps, ctx, id);
    if (!student) {
      await ctx.answerCbQuery(NOT_YOURS);
      return;
    }
    await ctx.answerCbQuery();
    if (a.kind !== 'cancel' && student.dateOfBirth) {
      await edit(ctx, ALREADY_FILLED);
      return;
    }
  } else {
    await ctx.answerCbQuery();
  }

  switch (a.kind) {
    case 'cancel': {
      const missing = student
        ? missingProfileFields(student)
        : (['gender', 'dateOfBirth'] as ProfileField[]);
      return edit(
        ctx,
        CANCELLED,
        missing.length
          ? {
              reply_markup: buildRequestKeyboard(
                student ? student.id : 'preview',
                missing,
              ).reply_markup,
            }
          : NO_KEYBOARD,
      );
    }
    case 'date':
      return show(ctx, decadesScreen(id, today));
    case 'decade':
      return show(ctx, yearsScreen(id, a.decade, today));
    case 'year':
      return show(ctx, monthsScreen(id, a.year));
    case 'month':
      return show(ctx, daysScreen(id, a.year, a.month));
    case 'confirm':
      return show(ctx, confirmScreen(id, a.iso));
    case 'save': {
      if (!student) {
        // Ko'rinish rejimi: hech narsa yozilmaydi.
        return edit(ctx, PREVIEW_NOTE, {
          reply_markup: buildRequestKeyboard('preview', ['gender'])
            .reply_markup,
        });
      }
      const problem = birthDateProblem(a.iso, today);
      if (problem) {
        return edit(ctx, `${problem}. Qaytadan tanlang.`, {
          reply_markup: retryKeyboard(id).reply_markup,
        });
      }
      await fillStudentProfile(
        deps,
        student,
        { dateOfBirth: a.iso },
        student.userId ?? undefined,
      );
      if (!student.gender) {
        return edit(ctx, DATE_SAVED, {
          reply_markup: buildRequestKeyboard(student.id, ['gender'])
            .reply_markup,
        });
      }
      return edit(ctx, THANKS);
    }
  }
}

export async function handleProfileTap(
  deps: ProfileDeps,
  ctx: ProfileCtx,
  action: ProfileAction,
  today: string = tashkentDateStr(new Date()),
): Promise<void> {
  if (action.kind === 'preview') {
    // Ko'rinish rejimi: bazaga tegmaydi, faqat keyingi qadamni ko'rsatadi.
    await ctx.answerCbQuery();
    await ctx.reply(`${PREVIEW_NOTE}\n\n${YEAR_PROMPT}`, {
      reply_markup: decadesScreen(PREVIEW_STUDENT_ID, today).keyboard
        .reply_markup,
    });
    return;
  }
  // 0 — faqat ko'rinish belgisi: u hech qachon haqiqiy kartaga yetmaydi.
  if (action.kind === 'gender' && action.studentId === PREVIEW_STUDENT_ID) {
    await ctx.answerCbQuery(NOT_YOURS);
    return;
  }
  if (!paramsValid(action, today)) {
    await ctx.answerCbQuery();
    return;
  }
  if (action.kind !== 'gender') {
    return handlePicker(deps, ctx, action, today);
  }

  const student = await loadOwned(deps, ctx, action.studentId);
  if (!student) {
    await ctx.answerCbQuery(NOT_YOURS);
    return;
  }
  await ctx.answerCbQuery();
  if (student.gender) {
    await edit(ctx, ALREADY_FILLED);
    return;
  }
  await fillStudentProfile(
    deps,
    student,
    { gender: action.gender },
    student.userId ?? undefined,
  );
  if (student.dateOfBirth) {
    await edit(ctx, THANKS);
    return;
  }
  await show(ctx, decadesScreen(student.id, today), `${GENDER_SAVED}\n\n`);
}
