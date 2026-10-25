import { Gender } from '@prisma/client';
import { handleProfileTap, submitBirthDate } from './profile-request.handlers';
import {
  ALREADY_FILLED,
  DATE_PROMPT,
  GENDER_SAVED,
  NOT_YOURS,
  PREVIEW_NOTE,
  THANKS,
} from './profile-request-text';

const row = (o: object = {}) => ({
  id: 7,
  gender: null,
  dateOfBirth: null,
  companyId: 1,
  userId: null,
  ...o,
});

function setup(found: object | null, chatId = 111) {
  const deps = {
    prisma: {
      student: {
        findFirst: jest.fn().mockResolvedValue(found),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
    },
    entityHistory: { recordUpdate: jest.fn().mockResolvedValue(undefined) },
  };
  const ctx = {
    chat: { id: chatId },
    reply: jest.fn().mockResolvedValue(undefined),
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
    scene: {
      enter: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
    },
  };
  return { deps: deps as any, ctx, raw: deps };
}

describe('handleProfileTap', () => {
  it('looks the student up by id AND this chat', async () => {
    const { deps, ctx, raw } = setup(row());
    await handleProfileTap(deps, ctx, {
      kind: 'gender',
      studentId: 7,
      gender: 'FEMALE',
    });
    expect(raw.prisma.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 7,
          telegramChatId: '111',
          deletedAt: null,
        }),
      }),
    );
  });

  it('writes nothing for a chat that does not own the card', async () => {
    const { deps, ctx, raw } = setup(null);
    await handleProfileTap(deps, ctx, {
      kind: 'gender',
      studentId: 7,
      gender: 'MALE',
    });
    expect(raw.prisma.student.update).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS);
  });

  it('saves gender, then asks for the date when it is missing', async () => {
    const { deps, ctx, raw } = setup(row());
    await handleProfileTap(deps, ctx, {
      kind: 'gender',
      studentId: 7,
      gender: 'FEMALE',
    });
    expect(raw.prisma.student.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { gender: Gender.FEMALE },
    });
    expect(ctx.reply).toHaveBeenCalledWith(GENDER_SAVED);
    expect(ctx.scene.enter).toHaveBeenCalledWith('profile-fill', {
      studentId: 7,
    });
  });

  it('saves gender and just thanks when the date is already there', async () => {
    const { deps, ctx } = setup(row({ dateOfBirth: new Date('2000-01-01') }));
    await handleProfileTap(deps, ctx, {
      kind: 'gender',
      studentId: 7,
      gender: 'MALE',
    });
    expect(ctx.reply).toHaveBeenCalledWith(THANKS);
    expect(ctx.scene.enter).not.toHaveBeenCalled();
  });

  it('says "already filled" on a stale gender button', async () => {
    const { deps, ctx, raw } = setup(row({ gender: Gender.MALE }));
    await handleProfileTap(deps, ctx, {
      kind: 'gender',
      studentId: 7,
      gender: 'FEMALE',
    });
    expect(raw.prisma.student.update).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(ALREADY_FILLED);
  });

  it('date button enters the scene, or says already filled', async () => {
    const a = setup(row());
    await handleProfileTap(a.deps, a.ctx, { kind: 'date', studentId: 7 });
    expect(a.ctx.scene.enter).toHaveBeenCalledWith('profile-fill', {
      studentId: 7,
    });
    const b = setup(row({ dateOfBirth: new Date('2000-01-01') }));
    await handleProfileTap(b.deps, b.ctx, { kind: 'date', studentId: 7 });
    expect(b.ctx.scene.enter).not.toHaveBeenCalled();
    expect(b.ctx.reply).toHaveBeenCalledWith(ALREADY_FILLED);
  });

  it('preview taps never touch the database', async () => {
    const { deps, ctx, raw } = setup(null);
    await handleProfileTap(deps, ctx, { kind: 'preview', step: 'gender' });
    expect(raw.prisma.student.findFirst).not.toHaveBeenCalled();
    expect(raw.prisma.student.update).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(`${PREVIEW_NOTE}\n\n${DATE_PROMPT}`);
  });
});

describe('submitBirthDate', () => {
  it('saves a valid date and finishes', async () => {
    const { deps, ctx, raw } = setup(row());
    expect(await submitBirthDate(deps, ctx, 7, '15.03.2005')).toBe('done');
    expect(raw.prisma.student.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { dateOfBirth: new Date('2005-03-15T00:00:00.000Z') },
    });
    expect(ctx.reply).toHaveBeenCalledWith(THANKS);
  });

  it('explains the problem and asks again; nothing is saved', async () => {
    const { deps, ctx, raw } = setup(row());
    expect(await submitBirthDate(deps, ctx, 7, '01.01.2030')).toBe('retry');
    expect(raw.prisma.student.update).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledTimes(1);
  });

  it('refuses a chat that does not own the card', async () => {
    const { deps, ctx, raw } = setup(null);
    expect(await submitBirthDate(deps, ctx, 7, '15.03.2005')).toBe('done');
    expect(raw.prisma.student.update).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(NOT_YOURS);
  });
});
