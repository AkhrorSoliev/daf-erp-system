import { Gender } from '@prisma/client';
import { handleProfileTap } from './profile-request.handlers';
import { YEAR_PROMPT } from './profile-date-picker';
import {
  ALREADY_FILLED,
  CANCELLED,
  GENDER_SAVED,
  NOT_YOURS,
  PREVIEW_NOTE,
  ProfileAction,
  THANKS,
} from './profile-request-text';

const TODAY = '2026-10-25';

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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
    },
    entityHistory: { recordUpdate: jest.fn().mockResolvedValue(undefined) },
  };
  const ctx = {
    chat: { id: chatId },
    reply: jest.fn().mockResolvedValue(undefined),
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
    editMessageText: jest.fn().mockResolvedValue(undefined),
  };
  const prismaCalls = () =>
    [
      deps.prisma.student.findFirst,
      deps.prisma.student.updateMany,
      deps.prisma.user.update,
      deps.entityHistory.recordUpdate,
    ].reduce((n, f) => n + f.mock.calls.length, 0);
  return { deps: deps as any, ctx, raw: deps, prismaCalls };
}

const tap = (s: ReturnType<typeof setup>, a: ProfileAction) =>
  handleProfileTap(s.deps, s.ctx, a, TODAY);

const pickerActions = (id: number): ProfileAction[] => [
  { kind: 'date', studentId: id },
  { kind: 'decade', studentId: id, decade: 2000 },
  { kind: 'year', studentId: id, year: 2005 },
  { kind: 'month', studentId: id, year: 2005, month: 3 },
  { kind: 'confirm', studentId: id, iso: '2005-03-15' },
  { kind: 'save', studentId: id, iso: '2005-03-15' },
];

describe('gender taps', () => {
  it('looks the student up by id AND this chat', async () => {
    const s = setup(row());
    await tap(s, { kind: 'gender', studentId: 7, gender: 'FEMALE' });
    expect(s.raw.prisma.student.findFirst).toHaveBeenCalledWith(
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
    const s = setup(null);
    await tap(s, { kind: 'gender', studentId: 7, gender: 'MALE' });
    expect(s.raw.prisma.student.updateMany).not.toHaveBeenCalled();
    expect(s.ctx.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS);
    expect(s.ctx.editMessageText).not.toHaveBeenCalled();
  });

  it('saves gender, then shows the year picker when the date is missing', async () => {
    const s = setup(row());
    await tap(s, { kind: 'gender', studentId: 7, gender: 'FEMALE' });
    expect(s.raw.prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: 7, gender: null },
      data: { gender: Gender.FEMALE },
    });
    const [text, extra] = s.ctx.editMessageText.mock.calls[0];
    expect(text).toBe(`${GENDER_SAVED}\n\n${YEAR_PROMPT}`);
    expect(extra.reply_markup.inline_keyboard[0][0].callback_data).toBe(
      'pf:dd:7:2020',
    );
  });

  it('saves gender and just thanks when the date is already there', async () => {
    const s = setup(row({ dateOfBirth: new Date('2000-01-01') }));
    await tap(s, { kind: 'gender', studentId: 7, gender: 'MALE' });
    expect(s.ctx.editMessageText.mock.calls[0][0]).toBe(THANKS);
  });

  it('says "already filled" on a stale gender button', async () => {
    const s = setup(row({ gender: Gender.MALE }));
    await tap(s, { kind: 'gender', studentId: 7, gender: 'FEMALE' });
    expect(s.raw.prisma.student.updateMany).not.toHaveBeenCalled();
    expect(s.ctx.editMessageText.mock.calls[0][0]).toBe(ALREADY_FILLED);
  });

  it('swallows "message is not modified" only', async () => {
    const s = setup(row({ gender: Gender.MALE }));
    s.ctx.editMessageText.mockRejectedValueOnce(
      new Error('400: Bad Request: message is not modified: exactly the same'),
    );
    await expect(
      tap(s, { kind: 'gender', studentId: 7, gender: 'FEMALE' }),
    ).resolves.toBeUndefined();
    const t = setup(row({ gender: Gender.MALE }));
    t.ctx.editMessageText.mockRejectedValueOnce(new Error('429: Too Many'));
    await expect(
      tap(t, { kind: 'gender', studentId: 7, gender: 'FEMALE' }),
    ).rejects.toThrow('429');
  });
});

describe('date picker', () => {
  it('start shows the decade screen', async () => {
    const s = setup(row());
    await tap(s, { kind: 'date', studentId: 7 });
    expect(s.ctx.editMessageText.mock.calls[0][0]).toBe(YEAR_PROMPT);
  });

  it('each screen is rendered for its callback', async () => {
    const s = setup(row());
    await tap(s, { kind: 'decade', studentId: 7, decade: 2000 });
    await tap(s, { kind: 'year', studentId: 7, year: 2005 });
    await tap(s, { kind: 'month', studentId: 7, year: 2004, month: 2 });
    await tap(s, { kind: 'confirm', studentId: 7, iso: '2005-03-15' });
    const texts = s.ctx.editMessageText.mock.calls.map((c: any[]) => c[0]);
    expect(texts).toEqual([
      'Yilni tanlang:',
      'Oyni tanlang:',
      'Kunni tanlang:',
      "Tug'ilgan sana: 15-mart, 2005. To'g'rimi?",
    ]);
  });

  it.each(pickerActions(7).map((a) => [a.kind, a] as const))(
    '%s: a foreign chat gets no edit and nothing is written',
    async (_k, action) => {
      const s = setup(null);
      await tap(s, action);
      expect(s.ctx.editMessageText).not.toHaveBeenCalled();
      expect(s.raw.prisma.student.updateMany).not.toHaveBeenCalled();
      expect(s.ctx.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS);
      expect(s.raw.prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ telegramChatId: '111', id: 7 }),
        }),
      );
    },
  );

  it('save writes a valid date and thanks without a keyboard', async () => {
    const s = setup(row());
    await tap(s, { kind: 'save', studentId: 7, iso: '2005-03-15' });
    expect(s.raw.prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: 7, dateOfBirth: null },
      data: { dateOfBirth: new Date('2005-03-15T00:00:00.000Z') },
    });
    const [text, extra] = s.ctx.editMessageText.mock.calls[0];
    expect(text).toBe(THANKS);
    expect(extra.reply_markup.inline_keyboard).toEqual([]);
  });

  it('save on an already filled date writes nothing', async () => {
    const s = setup(row({ dateOfBirth: new Date('2000-01-01') }));
    await tap(s, { kind: 'save', studentId: 7, iso: '2005-03-15' });
    expect(s.raw.prisma.student.updateMany).not.toHaveBeenCalled();
    expect(s.ctx.editMessageText.mock.calls[0][0]).toBe(ALREADY_FILLED);
  });

  it('save with a rule problem explains it and offers a retry', async () => {
    const s = setup(row());
    await tap(s, { kind: 'save', studentId: 7, iso: '2024-01-01' });
    expect(s.raw.prisma.student.updateMany).not.toHaveBeenCalled();
    const [text, extra] = s.ctx.editMessageText.mock.calls[0];
    expect(text).toBe("Yosh 5 dan 100 gacha bo'lishi kerak. Qaytadan tanlang.");
    expect(extra.reply_markup.inline_keyboard[0][0].callback_data).toBe(
      'pf:d:7',
    );
  });

  it.each([
    { kind: 'confirm', studentId: 7, iso: '2005-02-30' },
    { kind: 'save', studentId: 7, iso: '2005-02-30' },
    { kind: 'month', studentId: 7, year: 2005, month: 13 },
    { kind: 'decade', studentId: 7, decade: 2090 },
    { kind: 'year', studentId: 7, year: 1800 },
  ] as ProfileAction[])('%j is answered without an edit', async (a) => {
    const s = setup(row());
    await tap(s, a);
    expect(s.ctx.answerCbQuery).toHaveBeenCalled();
    expect(s.ctx.editMessageText).not.toHaveBeenCalled();
    expect(s.raw.prisma.student.updateMany).not.toHaveBeenCalled();
  });
});

describe('cancel and preview', () => {
  it('cancel edits to CANCELLED with no keyboard, no database', async () => {
    const s = setup(null);
    await tap(s, { kind: 'cancel' });
    const [text, extra] = s.ctx.editMessageText.mock.calls[0];
    expect(text).toBe(CANCELLED);
    expect(extra.reply_markup.inline_keyboard).toEqual([]);
    expect(s.prismaCalls()).toBe(0);
  });

  it('preview gender tap replies with the note and the year picker for id 0', async () => {
    const s = setup(null);
    await tap(s, { kind: 'preview' });
    const [text, extra] = s.ctx.reply.mock.calls[0];
    expect(text).toBe(`${PREVIEW_NOTE}\n\n${YEAR_PROMPT}`);
    expect(extra.reply_markup.inline_keyboard[0][0].callback_data).toBe(
      'pf:dd:0:2020',
    );
    expect(s.prismaCalls()).toBe(0);
  });

  it.each(pickerActions(0).map((a) => [a.kind, a] as const))(
    'studentId 0 (%s) never touches the database',
    async (_k, action) => {
      const s = setup(row());
      await tap(s, action);
      expect(s.prismaCalls()).toBe(0);
      expect(s.ctx.editMessageText).toHaveBeenCalledTimes(1);
    },
  );

  it('preview save edits to the preview note, nothing saved', async () => {
    const s = setup(row());
    await tap(s, { kind: 'save', studentId: 0, iso: '2005-03-15' });
    expect(s.ctx.editMessageText.mock.calls[0][0]).toBe(PREVIEW_NOTE);
  });

  it('studentId 0 can never reach fillStudentProfile', async () => {
    const s = setup(row());
    await tap(s, { kind: 'gender', studentId: 0, gender: 'MALE' });
    await tap(s, { kind: 'save', studentId: 0, iso: '2005-03-15' });
    expect(s.prismaCalls()).toBe(0);
  });
});
