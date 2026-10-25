import { Gender } from '@prisma/client';
import { handleProfileTap } from './profile-request.handlers';
import { YEAR_PROMPT } from './profile-date-picker';
import {
  ALREADY_FILLED,
  NOT_YOURS,
  PREVIEW_NOTE,
  ProfileAction,
  THANKS,
  buildRequestText,
} from './profile-request-text';

const TODAY = '2026-10-25';

const row = (o: object = {}) => ({
  id: 7,
  firstName: 'Vali',
  gender: null,
  dateOfBirth: null,
  companyId: 1,
  userId: null,
  ...o,
});
const FILLED_DOB = new Date('2000-01-01');

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
type S = ReturnType<typeof setup>;

const tap = (s: S, a: ProfileAction) =>
  handleProfileTap(s.deps, s.ctx, a, TODAY);
const edited = (s: S, n = 0) => s.ctx.editMessageText.mock.calls[n];
const cbOf = (call: any[]) =>
  (call[1].reply_markup.inline_keyboard as any[][])
    .flat()
    .map((b) => b.callback_data);
const noKeyboard = (call: any[]) =>
  expect(call[1].reply_markup.inline_keyboard).toEqual([]);

const allKinds = (id: number): ProfileAction[] => [
  { kind: 'start', studentId: id },
  { kind: 'gender', studentId: id, gender: 'M' },
  { kind: 'decades', studentId: id, g: 'M' },
  { kind: 'decade', studentId: id, g: 'M', decade: 2000 },
  { kind: 'year', studentId: id, g: 'M', year: 2005 },
  { kind: 'month', studentId: id, g: 'M', year: 2005, month: 3 },
  { kind: 'review', studentId: id, g: 'M', iso: '2005-03-15' },
  { kind: 'save', studentId: id, g: 'M', iso: '2005-03-15' },
  { kind: 'cancel', studentId: id },
];

describe('start', () => {
  it('looks the student up by id AND this chat', async () => {
    const s = setup(row());
    await tap(s, { kind: 'start', studentId: 7 });
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
  it('asks gender first when gender is missing (both, or gender only)', async () => {
    for (const r of [row(), row({ dateOfBirth: FILLED_DOB })]) {
      const s = setup(r);
      await tap(s, { kind: 'start', studentId: 7 });
      expect(edited(s)[0]).toBe('Jinsingizni tanlang:');
      expect(cbOf(edited(s))).toContain('pf:g:7:M');
    }
  });
  it('skips the gender question for a date-only student (g = N)', async () => {
    const s = setup(row({ gender: Gender.MALE }));
    await tap(s, { kind: 'start', studentId: 7 });
    expect(edited(s)[0]).toBe(YEAR_PROMPT);
    expect(cbOf(edited(s))[0]).toBe('pf:dd:7:N:2020');
  });
  it('says already filled when nothing is missing', async () => {
    const s = setup(row({ gender: Gender.MALE, dateOfBirth: FILLED_DOB }));
    await tap(s, { kind: 'start', studentId: 7 });
    expect(edited(s)[0]).toBe(ALREADY_FILLED);
    noKeyboard(edited(s));
  });
});

describe('wizard paths', () => {
  it('both missing: G -> date -> review with both lines -> ONE fill call', async () => {
    const s = setup(row());
    await tap(s, { kind: 'gender', studentId: 7, gender: 'F' });
    expect(edited(s)[0]).toBe(YEAR_PROMPT);
    expect(cbOf(edited(s))[0]).toBe('pf:dd:7:F:2020');
    await tap(s, { kind: 'decade', studentId: 7, g: 'F', decade: 2000 });
    await tap(s, { kind: 'year', studentId: 7, g: 'F', year: 2005 });
    await tap(s, { kind: 'month', studentId: 7, g: 'F', year: 2004, month: 2 });
    await tap(s, { kind: 'review', studentId: 7, g: 'F', iso: '2005-03-15' });
    expect(s.ctx.editMessageText.mock.calls.map((c: any[]) => c[0])).toEqual([
      YEAR_PROMPT,
      'Yilni tanlang:',
      'Oyni tanlang:',
      'Kunni tanlang:',
      "Tekshirib ko'ring:\n\nJins: Ayol\nTug'ilgan sana: 15-mart, 2005\n\nHammasi to'g'rimi?",
    ]);
    expect(s.raw.prisma.student.updateMany).not.toHaveBeenCalled();
    await tap(s, { kind: 'save', studentId: 7, g: 'F', iso: '2005-03-15' });
    expect(s.raw.prisma.student.updateMany).toHaveBeenCalledTimes(2);
    expect(s.raw.prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: 7, gender: null },
      data: { gender: Gender.FEMALE },
    });
    expect(s.raw.prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: 7, dateOfBirth: null },
      data: { dateOfBirth: new Date('2005-03-15T00:00:00.000Z') },
    });
    expect(s.raw.entityHistory.recordUpdate).toHaveBeenCalledTimes(1);
    const last = edited(s, 5);
    expect(last[0]).toBe(THANKS);
    noKeyboard(last);
  });

  it('gender-only student: G -> review without a date -> save', async () => {
    const s = setup(row({ dateOfBirth: FILLED_DOB }));
    await tap(s, { kind: 'gender', studentId: 7, gender: 'M' });
    expect(edited(s)[0]).toBe(
      "Tekshirib ko'ring:\n\nJins: Erkak\n\nHammasi to'g'rimi?",
    );
    expect(cbOf(edited(s))[0]).toBe('pf:ds:7:M:-');
    await tap(s, { kind: 'save', studentId: 7, g: 'M', iso: null });
    expect(s.raw.prisma.student.updateMany).toHaveBeenCalledTimes(1);
    expect(s.raw.prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: 7, gender: null },
      data: { gender: Gender.MALE },
    });
    expect(edited(s, 1)[0]).toBe(THANKS);
  });

  it('date-only student: review has no gender line, save writes the date', async () => {
    const s = setup(row({ gender: Gender.MALE }));
    await tap(s, { kind: 'review', studentId: 7, g: 'N', iso: '2005-03-15' });
    expect(edited(s)[0]).toBe(
      "Tekshirib ko'ring:\n\nTug'ilgan sana: 15-mart, 2005\n\nHammasi to'g'rimi?",
    );
    await tap(s, { kind: 'save', studentId: 7, g: 'N', iso: '2005-03-15' });
    expect(s.raw.prisma.student.updateMany).toHaveBeenCalledTimes(1);
    expect(edited(s, 1)[0]).toBe(THANKS);
  });

  it('a field filled meanwhile is skipped, the other is still written', async () => {
    const s = setup(row({ gender: Gender.MALE }));
    await tap(s, { kind: 'save', studentId: 7, g: 'F', iso: '2005-03-15' });
    expect(s.raw.prisma.student.updateMany).toHaveBeenCalledTimes(1);
    expect(s.raw.prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: 7, dateOfBirth: null },
      data: { dateOfBirth: new Date('2005-03-15T00:00:00.000Z') },
    });
    const t = setup(row({ dateOfBirth: FILLED_DOB }));
    await tap(t, { kind: 'save', studentId: 7, g: 'F', iso: '2005-03-15' });
    expect(t.raw.prisma.student.updateMany).toHaveBeenCalledTimes(1);
    expect(t.raw.prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: 7, gender: null },
      data: { gender: Gender.FEMALE },
    });
  });

  it('save with nothing left to write says already filled', async () => {
    const s = setup(row({ gender: Gender.MALE, dateOfBirth: FILLED_DOB }));
    await tap(s, { kind: 'save', studentId: 7, g: 'F', iso: '2005-03-15' });
    expect(s.raw.prisma.student.updateMany).not.toHaveBeenCalled();
    expect(edited(s)[0]).toBe(ALREADY_FILLED);
    noKeyboard(edited(s));
  });

  it('rule problem on save writes nothing and offers a retry', async () => {
    const s = setup(row());
    await tap(s, { kind: 'save', studentId: 7, g: 'F', iso: '2021-12-01' });
    expect(s.raw.prisma.student.updateMany).not.toHaveBeenCalled();
    expect(edited(s)[0]).toBe(
      "Yosh 5 dan 100 gacha bo'lishi kerak. Qaytadan tanlang.",
    );
    expect(cbOf(edited(s))).toEqual(['pf:s:7']);
  });

  it('the youngest offered year: too young is refused, old enough is written', async () => {
    const bad = setup(row());
    await tap(bad, { kind: 'save', studentId: 7, g: 'N', iso: '2021-12-01' });
    expect(bad.raw.prisma.student.updateMany).not.toHaveBeenCalled();
    const ok = setup(row());
    await tap(ok, { kind: 'save', studentId: 7, g: 'N', iso: '2021-03-01' });
    expect(ok.raw.prisma.student.updateMany).toHaveBeenCalled();
  });

  it.each([
    { kind: 'review', studentId: 7, g: 'M', iso: '2005-02-30' },
    { kind: 'save', studentId: 7, g: 'M', iso: '2005-02-30' },
    { kind: 'review', studentId: 7, g: 'M', iso: '0000-01-01' },
    { kind: 'save', studentId: 7, g: 'M', iso: '9999-01-01' },
    { kind: 'month', studentId: 7, g: 'M', year: 2005, month: 13 },
    { kind: 'decade', studentId: 7, g: 'M', decade: 2090 },
    { kind: 'year', studentId: 7, g: 'M', year: 1800 },
  ] as ProfileAction[])('%j is only answered', async (a) => {
    const s = setup(row());
    await tap(s, a);
    expect(s.ctx.answerCbQuery).toHaveBeenCalled();
    expect(s.ctx.editMessageText).not.toHaveBeenCalled();
    expect(s.raw.prisma.student.updateMany).not.toHaveBeenCalled();
  });

  it('decades screen goes back to G only while gender is asked', async () => {
    const s = setup(row());
    await tap(s, { kind: 'decades', studentId: 7, g: 'M' });
    expect(cbOf(edited(s)).slice(-2)).toEqual(['pf:s:7', 'pf:x:7']);
    const t = setup(row({ gender: Gender.MALE }));
    await tap(t, { kind: 'decades', studentId: 7, g: 'N' });
    expect(cbOf(edited(t)).slice(-1)).toEqual(['pf:x:7']);
  });

  it('swallows "message is not modified" only', async () => {
    const s = setup(row());
    s.ctx.editMessageText.mockRejectedValueOnce(
      new Error('400: Bad Request: message is not modified: exactly the same'),
    );
    await expect(
      tap(s, { kind: 'start', studentId: 7 }),
    ).resolves.toBeUndefined();
    const t = setup(row());
    t.ctx.editMessageText.mockRejectedValueOnce(new Error('429: Too Many'));
    await expect(tap(t, { kind: 'start', studentId: 7 })).rejects.toThrow(
      '429',
    );
  });
});

describe('cancel', () => {
  it('restores the original request with its single button', async () => {
    const s = setup(row({ firstName: 'Vali<' }));
    await tap(s, { kind: 'cancel', studentId: 7 });
    const call = edited(s);
    expect(call[0]).toBe(buildRequestText('Vali<'));
    expect(call[1].parse_mode).toBe('HTML');
    expect(cbOf(call)).toEqual(['pf:s:7']);
  });
  it('shows already filled with no keyboard when nothing is missing', async () => {
    const s = setup(row({ gender: Gender.MALE, dateOfBirth: FILLED_DOB }));
    await tap(s, { kind: 'cancel', studentId: 7 });
    expect(edited(s)[0]).toBe(ALREADY_FILLED);
    noKeyboard(edited(s));
  });
});

describe('ownership on every callback', () => {
  it.each(allKinds(7).map((a) => [a.kind, a] as const))(
    '%s: a foreign chat gets NOT_YOURS, no edit, no write',
    async (_k, action) => {
      const s = setup(null);
      await tap(s, action);
      expect(s.ctx.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS);
      expect(s.ctx.editMessageText).not.toHaveBeenCalled();
      expect(s.raw.prisma.student.updateMany).not.toHaveBeenCalled();
      expect(s.raw.prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ telegramChatId: '111', id: 7 }),
        }),
      );
    },
  );
});

describe('preview (student id 0)', () => {
  it.each(allKinds(0).map((a) => [a.kind, a] as const))(
    '%s never touches the database and edits once',
    async (_k, action) => {
      const s = setup(row());
      await tap(s, action);
      expect(s.prismaCalls()).toBe(0);
      expect(s.ctx.editMessageText).toHaveBeenCalledTimes(1);
    },
  );
  it('start assumes both fields missing: gender screen first', async () => {
    const s = setup(null);
    await tap(s, { kind: 'start', studentId: 0 });
    expect(edited(s)[0]).toBe('Jinsingizni tanlang:');
    expect(cbOf(edited(s))).toContain('pf:g:0:M');
  });
  it('the final save only shows the preview note', async () => {
    const s = setup(row());
    await tap(s, { kind: 'save', studentId: 0, g: 'M', iso: '2005-03-15' });
    expect(edited(s)[0]).toBe(PREVIEW_NOTE);
    noKeyboard(edited(s));
    expect(s.prismaCalls()).toBe(0);
  });
  it('cancel restores the request for Aziz with the pf:s:0 button', async () => {
    const s = setup(null);
    await tap(s, { kind: 'cancel', studentId: 0 });
    expect(edited(s)[0]).toBe(buildRequestText('Aziz'));
    expect(cbOf(edited(s))).toEqual(['pf:s:0']);
  });
});
