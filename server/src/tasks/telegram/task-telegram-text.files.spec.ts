import {
  photoPromptText,
  renderTaskMessage,
  type TgMessage,
  type TgTaskView,
} from './task-telegram-text';

const TASK = '0b9e6f3e-5a51-4c55-9a43-6f0d2c1e7a10';
const OPEN = `https://admin.dafzentrum.uz/tasks?task=${TASK}`;
const NOW = new Date('2026-10-07T05:00:00.000Z');

const view = (over: Partial<TgTaskView> = {}): TgTaskView => ({
  id: TASK,
  companyId: 1,
  kind: 'MANUAL',
  title: 'Oktabr reklama banneri uchun matn',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  dueAt: null,
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: null,
  participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' }],
  steps: [],
  history: [],
  ...over,
});
const labels = (m: TgMessage) => m.buttons.map((r) => r.map((b) => b.text));

describe('file and voice comment notices (amendment A6)', () => {
  const notice = (attachment?: 'FILE' | 'VOICE') =>
    renderTaskMessage(
      view(),
      {
        kind: 'COMMENT',
        by: 'Rahimov A.',
        text: 'chek.jpg',
        ...(attachment && { attachment }),
      },
      30,
      { now: NOW, openUrl: OPEN },
    );

  it('a file reads «Yangi fayl», the name stays the comment line', () => {
    const m = notice('FILE');
    expect(m.text.split('\n')).toEqual([
      '<b>📎 Yangi fayl</b>',
      '<blockquote><b>Oktabr reklama banneri uchun matn</b>',
      'Rahimov A.: «chek.jpg»</blockquote>',
    ]);
    expect(labels(m)).toEqual([['📂 Ochish']]);
  });

  it('a voice reads «Yangi ovozli xabar»; a plain comment is still «Yangi izoh»', () => {
    expect(notice('VOICE').text.split('\n')[0]).toBe(
      '<b>🎤 Yangi ovozli xabar</b>',
    );
    expect(notice().text.split('\n')[0]).toBe('<b>💬 Yangi izoh</b>');
  });
});

describe('photoPromptText', () => {
  it('names the task and escapes it', () => {
    expect(photoPromptText('<b>x</b>')).toBe(
      'Rasmni shu xabarga javob qilib yuboring.\n<b>&lt;b&gt;x&lt;/b&gt;</b>',
    );
  });
});
