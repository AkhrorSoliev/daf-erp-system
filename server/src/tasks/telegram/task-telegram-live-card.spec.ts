import {
  STATUS_NOTICES,
  renderLiveCard,
  type TgHistoryItem,
  type TgTaskView,
} from './task-telegram-text';
import type { TaskStatus } from '@prisma/client';

const OPEN = 'https://admin.example.uz/tg?next=x';
const T = new Date('2026-10-14T10:30:00Z'); // 14.10 15:30 Tashkent
const NOW = new Date('2026-10-14T12:00:00Z');

const view = (over: Partial<TgTaskView> = {}): TgTaskView => ({
  id: 't1',
  companyId: 1,
  kind: 'MANUAL',
  title: 'Banner',
  status: 'NEW',
  priority: 'HIGH',
  dueAt: null,
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: null,
  participants: [
    { userId: 40, role: 'ASSIGNEE', name: 'Karimov B.' },
    { userId: 41, role: 'ASSIGNEE', name: 'Rahimov A.' },
    { userId: 50, role: 'WATCHER', name: 'Aliyev C.' },
  ],
  steps: [],
  history: [],
  ...over,
});

const ev = (
  type: TgHistoryItem['type'],
  to: TaskStatus | null,
  actorId: number | null,
  actorName: string | null,
  at: Date,
  text: string | null = null,
): TgHistoryItem => ({ type, to, actorId, actorName, text, at });

const E = new Date('2026-10-13T06:00:00Z');
const lines = (v: TgTaskView, me: number) =>
  renderLiveCard(v, me, { now: NOW, openUrl: OPEN }).text.split('\n');
const buttons = (v: TgTaskView, me: number) =>
  renderLiveCard(v, me, { now: NOW, openUrl: OPEN })
    .buttons.flat()
    .map((b) => b.text);

describe('renderLiveCard', () => {
  it('STATUS_NOTICES names the notices the live card replaces', () => {
    expect([...STATUS_NOTICES].sort()).toEqual(
      [
        'ASSIGNED',
        'ADDED',
        'MOVED',
        'REVIEW',
        'ACCEPTED',
        'RETURNED',
        'DONE',
        'CANCELLED',
      ].sort(),
    );
  });

  it('NEW to the assignee', () => {
    const v = view();
    expect(lines(v, 40)).toEqual([
      '<b>Yangi topshiriq · Yuqori</b>',
      'Banner',
      'Bergan: Soliyev A.',
    ]);
    expect(buttons(v, 40)).toEqual(['Boshladim', 'Bajardim', 'Ochish']);
  });

  it('«Ochish» is a web_app button', () => {
    const m = renderLiveCard(view(), 40, { now: NOW, openUrl: OPEN });
    const open = m.buttons.at(-1)?.[0];
    expect(open).toMatchObject({ text: 'Ochish', web_app: { url: OPEN } });
    expect(open).not.toHaveProperty('url');
    expect(open).not.toHaveProperty('callback_data');
  });

  const started = view({
    status: 'IN_PROGRESS',
    history: [ev('STATUS', 'IN_PROGRESS', 40, 'Karimov B.', E)],
  });
  it('IN_PROGRESS to the one who started', () => {
    expect(lines(started, 40)).toEqual([
      '<b>🔄 Jarayonda</b>',
      'Banner',
      'Siz boshladingiz',
      'Bergan: Soliyev A.',
    ]);
    expect(buttons(started, 40)).toEqual(['Bajardim', 'Ochish']);
  });
  it('IN_PROGRESS to the other assignee', () => {
    expect(lines(started, 41)).toEqual([
      '<b>🔄 Jarayonda</b>',
      'Banner',
      'Karimov B. boshladi',
      'Bergan: Soliyev A.',
    ]);
    expect(buttons(started, 41)).toEqual(['Bajardim', 'Ochish']);
  });

  const returned = view({
    status: 'IN_PROGRESS',
    history: [
      ev('RETURN', null, 30, 'Soliyev A.', T, 'Rasm yo‘q'),
      ev('STATUS', 'IN_REVIEW', 40, 'Karimov B.', E),
    ],
  });
  it('returned, to the assignee', () => {
    expect(lines(returned, 40)).toEqual([
      '<b>↩️ Qaytarildi</b>',
      'Banner',
      'Soliyev A.: «Rasm yo‘q»',
      'Bergan: Soliyev A.',
    ]);
    expect(buttons(returned, 40)).toEqual(['Bajardim', 'Ochish']);
  });
  it('returned, to the author', () => {
    expect(lines(returned, 30)).toEqual([
      '<b>↩️ Siz qaytardingiz</b>',
      'Banner',
      '«Rasm yo‘q»',
    ]);
    expect(buttons(returned, 30)).toEqual(['Ochish']);
  });

  const inReview = view({
    status: 'IN_REVIEW',
    history: [ev('STATUS', 'IN_REVIEW', 40, 'Karimov B.', E)],
  });
  it('IN_REVIEW to the one who sent it', () => {
    expect(lines(inReview, 40)).toEqual([
      '<b>⏳ Tekshiruvda</b>',
      'Banner',
      'Siz yubordingiz',
      'Bergan: Soliyev A.',
    ]);
    expect(buttons(inReview, 40)).toEqual(['Ochish']);
  });
  it('IN_REVIEW to the other assignee', () => {
    expect(lines(inReview, 41)).toEqual([
      '<b>⏳ Tekshiruvda</b>',
      'Banner',
      'Karimov B. bajardi',
      'Bergan: Soliyev A.',
    ]);
    expect(buttons(inReview, 41)).toEqual(['Ochish']);
  });
  it('IN_REVIEW to the author', () => {
    expect(lines(inReview, 30)).toEqual([
      '<b>Tekshiruvga keldi</b>',
      'Banner',
      'Karimov B. bajardi',
    ]);
    expect(buttons(inReview, 30)).toEqual([
      'Qabul qilish',
      'Qaytarish',
      'Ochish',
    ]);
  });

  const done = view({
    status: 'DONE',
    history: [
      ev('STATUS', 'DONE', 30, 'Soliyev A.', T),
      ev('STATUS', 'IN_REVIEW', 40, 'Karimov B.', E),
    ],
  });
  it('DONE to the one who did it', () => {
    expect(lines(done, 40)).toEqual([
      '<b>✅ Bajarildi</b>',
      'Banner',
      'Siz bajardingiz, Soliyev A. qabul qildi · 14.10, 15:30',
    ]);
    expect(buttons(done, 40)).toEqual(['Ochish']);
  });
  it('DONE to the other assignee', () => {
    expect(lines(done, 41)).toEqual([
      '<b>✅ Bajarildi</b>',
      'Banner',
      'Karimov B. bajardi · 14.10, 15:30',
    ]);
    expect(buttons(done, 41)).toEqual(['Ochish']);
  });
  it('DONE to the author who accepted', () => {
    expect(lines(done, 30)).toEqual([
      '<b>✅ Qabul qildingiz</b>',
      'Banner',
      'Ijrochi: Karimov B. · 14.10, 15:30',
    ]);
    expect(buttons(done, 30)).toEqual(['Ochish']);
  });
  it('DONE to the watcher', () => {
    expect(lines(done, 50)).toEqual([
      '<b>✅ Bajarildi</b>',
      'Banner',
      'Karimov B. bajardi, Soliyev A. qabul qildi · 14.10, 15:30',
    ]);
    expect(buttons(done, 50)).toEqual(['Ochish']);
  });
  it('DONE self-task (no review)', () => {
    const v = view({
      status: 'DONE',
      authorId: 40,
      authorName: 'Karimov B.',
      participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Karimov B.' }],
      history: [ev('STATUS', 'DONE', 40, 'Karimov B.', T)],
    });
    expect(lines(v, 40)).toEqual([
      '<b>✅ Bajarildi</b>',
      'Banner',
      'Siz bajardingiz · 14.10, 15:30',
    ]);
    expect(buttons(v, 40)).toEqual(['Ochish']);
  });
  it('DONE by the system (auto-closed)', () => {
    const v = view({
      status: 'DONE',
      history: [ev('AUTO_CLOSED', null, null, null, T)],
    });
    expect(lines(v, 40)).toEqual([
      '<b>✅ Yopildi</b>',
      'Banner',
      'Tizim · 14.10, 15:30',
    ]);
    expect(buttons(v, 40)).toEqual(['Ochish']);
  });
  it('DONE with no history (old task): bare headline', () => {
    const v = view({ status: 'DONE' });
    expect(lines(v, 40)).toEqual(['<b>✅ Bajarildi</b>', 'Banner']);
    expect(buttons(v, 40)).toEqual(['Ochish']);
  });

  const cancelled = view({
    status: 'CANCELLED',
    history: [ev('CANCELLED', null, 30, 'Soliyev A.', T, 'Kerak emas')],
  });
  it('CANCELLED to the assignee', () => {
    expect(lines(cancelled, 40)).toEqual([
      '<b>❌ Bekor qilindi</b>',
      'Banner',
      'Soliyev A.: «Kerak emas» · 14.10, 15:30',
    ]);
    expect(buttons(cancelled, 40)).toEqual(['Ochish']);
  });
  it('CANCELLED to the one who cancelled', () => {
    expect(lines(cancelled, 30)).toEqual([
      '<b>❌ Siz bekor qildingiz</b>',
      'Banner',
      '«Kerak emas» · 14.10, 15:30',
    ]);
    expect(buttons(cancelled, 30)).toEqual(['Ochish']);
  });
  it('CANCELLED without a reason', () => {
    const v = view({
      status: 'CANCELLED',
      history: [ev('CANCELLED', null, 30, 'Soliyev A.', T)],
    });
    expect(lines(v, 40)[2]).toBe('Soliyev A. · 14.10, 15:30');
    expect(lines(v, 30)[2]).toBe('14.10, 15:30');
  });

  it('a viewer no longer on the task: no buttons at all', () => {
    const m = renderLiveCard(started, 99, { now: NOW, openUrl: OPEN });
    expect(m.text.split('\n')).toEqual([
      '<b>Topshiriqdan olib tashlandingiz</b>',
      'Banner',
    ]);
    expect(m.buttons).toEqual([]);
  });

  it("a system task: «Tizim topshirig'i», «Ochish» only", () => {
    const v = view({ kind: 'BROKEN_PROMISE' });
    expect(lines(v, 40)).toEqual([
      "<b>Tizim topshirig'i · Yuqori</b>",
      'Banner',
      'Bergan: Soliyev A.',
    ]);
    expect(buttons(v, 40)).toEqual(['Ochish']);
  });

  it('no openUrl: no «Ochish»', () => {
    expect(
      renderLiveCard(view(), 40, { now: NOW })
        .buttons.flat()
        .map((b) => b.text),
    ).toEqual(['Boshladim', 'Bajardim']);
  });

  it('body lines on an open task for a non-author: due, link, steps, photo', () => {
    const v = view({
      dueAt: new Date('2026-10-14T13:00:00Z'), // today 18:00
      entityLabel: 'A1-3 guruh',
      steps: [
        { id: 's1', title: 'a', done: true },
        { id: 's2', title: 'b', done: false },
      ],
      requiresPhoto: true,
    });
    expect(lines(v, 40)).toEqual([
      '<b>Yangi topshiriq · Yuqori</b>',
      'Banner',
      'Bergan: Soliyev A.',
      'Muddat: bugun, 18:00',
      "Bog'liq: A1-3 guruh",
      'Kichik qadamlar: 1/2',
      'Rasm bilan tasdiqlanadi.',
    ]);
    // The author gets no body: they wrote the task.
    expect(lines(v, 30)).toEqual(['<b>Yangi topshiriq · Yuqori</b>', 'Banner']);
  });
});
