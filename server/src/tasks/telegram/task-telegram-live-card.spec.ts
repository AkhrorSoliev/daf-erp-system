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
const text = (v: TgTaskView, me: number) =>
  renderLiveCard(v, me, { now: NOW, openUrl: OPEN }).text;
const buttons = (v: TgTaskView, me: number) =>
  renderLiveCard(v, me, { now: NOW, openUrl: OPEN })
    .buttons.flat()
    .map((b) => b.text);
/** Style B: the title (and the «who» line) sit in a blockquote under the headline. */
const quote = (...inner: string[]) =>
  `<blockquote>${['<b>Banner</b>', ...inner].join('\n')}</blockquote>`;
const META = ['👤 Bergan: Soliyev A.', '⚡ Yuqori'];

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
    expect(text(v, 40)).toBe(
      ['<b>🆕 Yangi topshiriq</b>', quote(), ...META].join('\n'),
    );
    expect(buttons(v, 40)).toEqual([
      '▶️ Boshladim',
      '✅ Bajardim',
      '📂 Ochish',
    ]);
  });

  it('«Ochish» is a web_app button', () => {
    const m = renderLiveCard(view(), 40, { now: NOW, openUrl: OPEN });
    const open = m.buttons.at(-1)?.[0];
    expect(open).toMatchObject({ text: '📂 Ochish', web_app: { url: OPEN } });
    expect(open).not.toHaveProperty('url');
    expect(open).not.toHaveProperty('callback_data');
  });

  const started = view({
    status: 'IN_PROGRESS',
    history: [ev('STATUS', 'IN_PROGRESS', 40, 'Karimov B.', E)],
  });
  it('IN_PROGRESS to the one who started', () => {
    expect(text(started, 40)).toBe(
      ['<b>🔄 Jarayonda</b>', quote('Siz boshladingiz'), ...META].join('\n'),
    );
    expect(buttons(started, 40)).toEqual(['✅ Bajardim', '📂 Ochish']);
  });
  it('IN_PROGRESS to the other assignee', () => {
    expect(text(started, 41)).toBe(
      ['<b>🔄 Jarayonda</b>', quote('Karimov B. boshladi'), ...META].join('\n'),
    );
    expect(buttons(started, 41)).toEqual(['✅ Bajardim', '📂 Ochish']);
  });

  const returned = view({
    status: 'IN_PROGRESS',
    history: [
      ev('RETURN', null, 30, 'Soliyev A.', T, 'Rasm yo‘q'),
      ev('STATUS', 'IN_REVIEW', 40, 'Karimov B.', E),
    ],
  });
  it('returned, to the assignee', () => {
    expect(text(returned, 40)).toBe(
      ['<b>↩️ Qaytarildi</b>', quote('Soliyev A.: «Rasm yo‘q»'), ...META].join(
        '\n',
      ),
    );
    expect(buttons(returned, 40)).toEqual(['✅ Bajardim', '📂 Ochish']);
  });
  it('returned, to the author', () => {
    expect(text(returned, 30)).toBe(
      ['<b>↩️ Siz qaytardingiz</b>', quote('«Rasm yo‘q»')].join('\n'),
    );
    expect(buttons(returned, 30)).toEqual(['📂 Ochish']);
  });

  const inReview = view({
    status: 'IN_REVIEW',
    history: [ev('STATUS', 'IN_REVIEW', 40, 'Karimov B.', E)],
  });
  it('IN_REVIEW to the one who sent it', () => {
    expect(text(inReview, 40)).toBe(
      ['<b>⏳ Tekshiruvda</b>', quote('Siz yubordingiz'), ...META].join('\n'),
    );
    expect(buttons(inReview, 40)).toEqual(['📂 Ochish']);
  });
  it('IN_REVIEW to the other assignee', () => {
    expect(text(inReview, 41)).toBe(
      ['<b>⏳ Tekshiruvda</b>', quote('Karimov B. bajardi'), ...META].join(
        '\n',
      ),
    );
    expect(buttons(inReview, 41)).toEqual(['📂 Ochish']);
  });
  it('IN_REVIEW to the author', () => {
    expect(text(inReview, 30)).toBe(
      ['<b>📥 Tekshiruvga keldi</b>', quote('Karimov B. bajardi')].join('\n'),
    );
    expect(buttons(inReview, 30)).toEqual([
      '✅ Qabul qilish',
      '↩️ Qaytarish',
      '📂 Ochish',
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
    expect(text(done, 40)).toBe(
      [
        '<b>✅ Bajarildi</b>',
        quote('Siz bajardingiz, Soliyev A. qabul qildi · 14.10, 15:30'),
      ].join('\n'),
    );
    expect(buttons(done, 40)).toEqual(['📂 Ochish']);
  });
  it('DONE to the other assignee', () => {
    expect(text(done, 41)).toBe(
      ['<b>✅ Bajarildi</b>', quote('Karimov B. bajardi · 14.10, 15:30')].join(
        '\n',
      ),
    );
    expect(buttons(done, 41)).toEqual(['📂 Ochish']);
  });
  it('DONE to the author who accepted', () => {
    expect(text(done, 30)).toBe(
      [
        '<b>✅ Qabul qildingiz</b>',
        quote('Ijrochi: Karimov B. · 14.10, 15:30'),
      ].join('\n'),
    );
    expect(buttons(done, 30)).toEqual(['📂 Ochish']);
  });
  it('DONE to the watcher', () => {
    expect(text(done, 50)).toBe(
      [
        '<b>✅ Bajarildi</b>',
        quote('Karimov B. bajardi, Soliyev A. qabul qildi · 14.10, 15:30'),
      ].join('\n'),
    );
    expect(buttons(done, 50)).toEqual(['📂 Ochish']);
  });
  it('DONE self-task (no review)', () => {
    const v = view({
      status: 'DONE',
      authorId: 40,
      authorName: 'Karimov B.',
      participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Karimov B.' }],
      history: [ev('STATUS', 'DONE', 40, 'Karimov B.', T)],
    });
    expect(text(v, 40)).toBe(
      ['<b>✅ Bajarildi</b>', quote('Siz bajardingiz · 14.10, 15:30')].join(
        '\n',
      ),
    );
    expect(buttons(v, 40)).toEqual(['📂 Ochish']);
  });
  it('DONE by the system (auto-closed)', () => {
    const v = view({
      status: 'DONE',
      history: [ev('AUTO_CLOSED', null, null, null, T)],
    });
    expect(text(v, 40)).toBe(
      ['<b>✅ Yopildi</b>', quote('Tizim · 14.10, 15:30')].join('\n'),
    );
    expect(buttons(v, 40)).toEqual(['📂 Ochish']);
  });
  it('DONE with no history (old task): bare headline', () => {
    const v = view({ status: 'DONE' });
    expect(text(v, 40)).toBe(['<b>✅ Bajarildi</b>', quote()].join('\n'));
    expect(buttons(v, 40)).toEqual(['📂 Ochish']);
  });

  const cancelled = view({
    status: 'CANCELLED',
    history: [ev('CANCELLED', null, 30, 'Soliyev A.', T, 'Kerak emas')],
  });
  it('CANCELLED to the assignee', () => {
    expect(text(cancelled, 40)).toBe(
      [
        '<b>❌ Bekor qilindi</b>',
        quote('Soliyev A.: «Kerak emas» · 14.10, 15:30'),
      ].join('\n'),
    );
    expect(buttons(cancelled, 40)).toEqual(['📂 Ochish']);
  });
  it('CANCELLED to the one who cancelled', () => {
    expect(text(cancelled, 30)).toBe(
      [
        '<b>❌ Siz bekor qildingiz</b>',
        quote('«Kerak emas» · 14.10, 15:30'),
      ].join('\n'),
    );
    expect(buttons(cancelled, 30)).toEqual(['📂 Ochish']);
  });
  it('CANCELLED without a reason', () => {
    const v = view({
      status: 'CANCELLED',
      history: [ev('CANCELLED', null, 30, 'Soliyev A.', T)],
    });
    expect(text(v, 40)).toBe(
      ['<b>❌ Bekor qilindi</b>', quote('Soliyev A. · 14.10, 15:30')].join(
        '\n',
      ),
    );
    expect(text(v, 30)).toBe(
      ['<b>❌ Siz bekor qildingiz</b>', quote('14.10, 15:30')].join('\n'),
    );
  });

  it('a viewer no longer on the task: no buttons at all', () => {
    const m = renderLiveCard(started, 99, { now: NOW, openUrl: OPEN });
    expect(m.text).toBe(
      ['<b>🚫 Topshiriqdan olib tashlandingiz</b>', quote()].join('\n'),
    );
    expect(m.buttons).toEqual([]);
  });

  it("a system task: «Tizim topshirig'i», «Ochish» only", () => {
    const v = view({ kind: 'BROKEN_PROMISE' });
    expect(text(v, 40)).toBe(
      ["<b>🤖 Tizim topshirig'i</b>", quote(), ...META].join('\n'),
    );
    expect(buttons(v, 40)).toEqual(['📂 Ochish']);
  });

  it('no openUrl: no «Ochish»', () => {
    expect(
      renderLiveCard(view(), 40, { now: NOW })
        .buttons.flat()
        .map((b) => b.text),
    ).toEqual(['▶️ Boshladim', '✅ Bajardim']);
  });

  it('meta lines on an open task for a non-author: due · priority, link, steps, photo', () => {
    const v = view({
      dueAt: new Date('2026-10-14T13:00:00Z'), // today 18:00
      entityLabel: 'A1-3 guruh',
      steps: [
        { id: 's1', title: 'a', done: true },
        { id: 's2', title: 'b', done: false },
      ],
      requiresPhoto: true,
    });
    expect(text(v, 40)).toBe(
      [
        '<b>🆕 Yangi topshiriq</b>',
        quote(),
        '👤 Bergan: Soliyev A.',
        '⏰ bugun, 18:00 · ⚡ Yuqori',
        "🔗 Bog'liq: A1-3 guruh",
        '☑️ Kichik qadamlar: 1/2',
        '📷 Rasm bilan tasdiqlanadi.',
      ].join('\n'),
    );
    // The author gets no meta: they wrote the task.
    expect(text(v, 30)).toBe(['<b>🆕 Yangi topshiriq</b>', quote()].join('\n'));
  });

  it('priority: URGENT and HIGH are named, LOW / MEDIUM say nothing', () => {
    const due = new Date('2026-10-14T13:00:00Z');
    expect(text(view({ priority: 'URGENT', dueAt: due }), 40)).toBe(
      [
        '<b>🆕 Yangi topshiriq</b>',
        quote(),
        '👤 Bergan: Soliyev A.',
        '⏰ bugun, 18:00 · 🔥 Shoshilinch',
      ].join('\n'),
    );
    expect(text(view({ priority: 'URGENT' }), 40)).toBe(
      [
        '<b>🆕 Yangi topshiriq</b>',
        quote(),
        '👤 Bergan: Soliyev A.',
        '🔥 Shoshilinch',
      ].join('\n'),
    );
    expect(text(view({ priority: 'MEDIUM', dueAt: due }), 40)).toBe(
      [
        '<b>🆕 Yangi topshiriq</b>',
        quote(),
        '👤 Bergan: Soliyev A.',
        '⏰ bugun, 18:00',
      ].join('\n'),
    );
    expect(text(view({ priority: 'LOW' }), 40)).toBe(
      ['<b>🆕 Yangi topshiriq</b>', quote(), '👤 Bergan: Soliyev A.'].join(
        '\n',
      ),
    );
  });

  it('a title or a reason with <b> is escaped inside the blockquote', () => {
    const v = view({
      title: 'A <b>B</b> & C',
      status: 'IN_PROGRESS',
      history: [
        ev('RETURN', null, 30, 'So <i>liyev</i>', T, '<b>Rasm</b> yo‘q'),
        ev('STATUS', 'IN_REVIEW', 40, 'Karimov B.', E),
      ],
    });
    expect(text(v, 40)).toBe(
      [
        '<b>↩️ Qaytarildi</b>',
        '<blockquote><b>A &lt;b&gt;B&lt;/b&gt; &amp; C</b>',
        'So &lt;i&gt;liyev&lt;/i&gt;: «&lt;b&gt;Rasm&lt;/b&gt; yo‘q»</blockquote>',
        ...META,
      ].join('\n'),
    );
  });
});
