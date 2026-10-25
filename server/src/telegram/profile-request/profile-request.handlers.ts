import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../../common/entity-history';
import {
  ProfileTarget,
  fillStudentProfile,
} from '../../students/shared/fill-student-profile';
import { SCENES } from '../constants';
import {
  ALREADY_FILLED,
  DATE_PROMPT,
  GENDER_SAVED,
  NOT_YOURS,
  PREVIEW_NOTE,
  ProfileAction,
  THANKS,
  parseBirthDateInput,
} from './profile-request-text';

export interface ProfileCtx {
  chat?: { id: number | string };
  reply(text: string, extra?: any): Promise<unknown>;
  answerCbQuery(text?: string): Promise<unknown>;
  scene: {
    enter(id: string, state?: object): Promise<unknown>;
    leave(): Promise<unknown>;
  };
}

export interface ProfileDeps {
  prisma: PrismaService;
  entityHistory: EntityHistoryService;
}

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

export async function handleProfileTap(
  deps: ProfileDeps,
  ctx: ProfileCtx,
  action: ProfileAction,
): Promise<void> {
  if (action.kind === 'preview') {
    // Ko'rinish rejimi: bazaga tegmaydi, faqat keyingi qadam matnini ko'rsatadi.
    await ctx.answerCbQuery();
    await ctx.reply(`${PREVIEW_NOTE}\n\n${DATE_PROMPT}`);
    return;
  }

  const student = await loadOwned(deps, ctx, action.studentId);
  if (!student) {
    await ctx.answerCbQuery(NOT_YOURS);
    return;
  }
  await ctx.answerCbQuery();

  if (action.kind === 'date') {
    if (student.dateOfBirth) {
      await ctx.reply(ALREADY_FILLED);
      return;
    }
    await ctx.scene.enter(SCENES.PROFILE_FILL, { studentId: student.id });
    return;
  }

  if (student.gender) {
    await ctx.reply(ALREADY_FILLED);
    return;
  }
  await fillStudentProfile(
    deps,
    student,
    { gender: action.gender },
    student.userId ?? undefined,
  );
  if (student.dateOfBirth) {
    await ctx.reply(THANKS);
    return;
  }
  await ctx.reply(GENDER_SAVED);
  await ctx.scene.enter(SCENES.PROFILE_FILL, { studentId: student.id });
}

/** 'retry' — sana qabul qilinmadi, scene ochiq qoladi. */
export async function submitBirthDate(
  deps: ProfileDeps,
  ctx: ProfileCtx,
  studentId: number,
  text: string,
): Promise<'done' | 'retry'> {
  const parsed = parseBirthDateInput(text);
  if (!parsed.ok) {
    await ctx.reply(parsed.message);
    return 'retry';
  }
  const student = await loadOwned(deps, ctx, studentId);
  if (!student) {
    await ctx.reply(NOT_YOURS);
    return 'done';
  }
  if (student.dateOfBirth) {
    await ctx.reply(ALREADY_FILLED);
    return 'done';
  }
  await fillStudentProfile(
    deps,
    student,
    { dateOfBirth: parsed.iso },
    student.userId ?? undefined,
  );
  await ctx.reply(THANKS);
  return 'done';
}
