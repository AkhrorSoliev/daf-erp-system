import {
  dueLabel,
  esc,
  isSelfTask,
  keptHeadline,
  parseTk,
  renderMyTasks,
  renderStepsMessage,
  renderTaskMessage,
  returnedReply,
  shortName,
  tkData,
  type TgMessage,
  type TgTaskView,
} from './task-telegram-text';

const TASK = '0b9e6f3e-5a51-4c55-9a43-6f0d2c1e7a10';
const OPEN = `https://admin.dafzentrum.uz/tasks?task=${TASK}`;
const NOW = new Date('2026-10-07T05:00:00.000Z'); // 07.10 10:00 Tashkent

const steps = [
  'Matn qoralamasi',
  'Narxlarni tekshirish',
  'Dizaynerga yuborish',
  'Dizaynni tasdiqlatish',
  'Chop etishga berish',
].map((title, i) => ({ id: `step-${i + 1}`, title, done: false }));

const view = (over: Partial<TgTaskView> = {}): TgTaskView => ({
  id: TASK,
  companyId: 1,
  kind: 'MANUAL',
  title: 'Oktabr reklama banneri uchun matn',
  status: 'NEW',
  priority: 'HIGH',
  dueAt: new Date('2026-10-09T13:00:00.000Z'), // 09.10 18:00
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: 'A1-3 guruh',
  participants: [
    { userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' },
    { userId: 50, role: 'WATCHER', name: 'Karimov B.' },
  ],
  steps,
  ...over,
});
const labels = (m: TgMessage) => m.buttons.map((r) => r.map((b) => b.text));
const data = (m: TgMessage) =>
  m.buttons
    .flat()
    .map((b) =>
      'callback_data' in b ? b.callback_data : 'url' in b ? b.url : '',
    );

describe('renderTaskMessage (mockup s14)', () => {
  it('#1 a new task to the assignee', () => {
    const m = renderTaskMessage(view(), { kind: 'ASSIGNED' }, 40, {
      now: NOW,
      openUrl: OPEN,
    });
    expect(m.text).toBe(
      [
        '<b>Yangi topshiriq · Yuqori</b>',
        'Oktabr reklama banneri uchun matn',
        'Bergan: Soliyev A.',
        'Muddat: 09.10, 18:00',
        "Bog'liq: A1-3 guruh",
        'Kichik qadamlar: 0/5',
      ].join('\n'),
    );
    expect(labels(m)).toEqual([
      ['Boshladim', 'Bajardim'],
      ['Qadamlar'],
      ['Ochish'],
    ]);
    expect(data(m)).toEqual([
      `tk:start:${TASK}`,
      `tk:done:${TASK}`,
      `tk:steps:${TASK}`,
      OPEN,
    ]);
  });

  it('#1 after «Boshladim» the same headline, «Holat: Jarayonda», no «Boshladim»', () => {
    const m = renderTaskMessage(
      view({ status: 'IN_PROGRESS' }),
      { kind: 'CARD', headline: 'Yangi topshiriq · Yuqori' },
      40,
      { now: NOW, openUrl: OPEN },
    );
    expect(m.text.split('\n')[0]).toBe('<b>Yangi topshiriq · Yuqori</b>');
    expect(m.text).toContain('Holat: Jarayonda');
    expect(labels(m)).toEqual([['Bajardim'], ['Qadamlar'], ['Ochish']]);
  });

  it('#2 a task confirmed with a photo: «Boshladim» only, and the photo line', () => {
    const m = renderTaskMessage(
      view({ requiresPhoto: true, steps: [] }),
      { kind: 'ASSIGNED' },
      40,
      { now: NOW, openUrl: OPEN },
    );
    expect(labels(m)).toEqual([['Boshladim'], ['Ochish']]);
    expect(m.text).toContain('Rasm bilan tasdiqlanadi.');
    const started = renderTaskMessage(
      view({ requiresPhoto: true, steps: [], status: 'IN_PROGRESS' }),
      { kind: 'CARD' },
      40,
      { now: NOW, openUrl: OPEN },
    );
    expect(labels(started)).toEqual([['Ochish']]);
  });

  it('#3 review to the author: who did it, «Qabul qilish» · «Qaytarish»', () => {
    const m = renderTaskMessage(
      view({ status: 'IN_REVIEW', steps: [] }),
      { kind: 'REVIEW', by: 'Rahimov A.' },
      30,
      { now: NOW, openUrl: OPEN },
    );
    expect(m.text.split('\n').slice(0, 3)).toEqual([
      '<b>Tekshiruvga keldi</b>',
      'Oktabr reklama banneri uchun matn',
      'Ijrochi: Rahimov A.',
    ]);
    expect(m.text).not.toContain('Bergan:');
    expect(labels(m)).toEqual([['Qabul qilish', 'Qaytarish'], ['Ochish']]);
  });

  it('#4 returned: the reason, «Bajardim» again; accepted: thanks, «Ochish» only', () => {
    const back = renderTaskMessage(
      view({ status: 'IN_PROGRESS', steps: [] }),
      {
        kind: 'RETURNED',
        by: 'Azizova M.',
        reason: 'Doska artilmagan, qayta qiling',
      },
      40,
      { now: NOW, openUrl: OPEN },
    );
    expect(back.text).toContain('Azizova M.: «Doska artilmagan, qayta qiling»');
    expect(back.text).toContain('Holat: Jarayonda');
    expect(labels(back)).toEqual([['Bajardim'], ['Ochish']]);
    const ok = renderTaskMessage(
      view({ status: 'DONE' }),
      { kind: 'ACCEPTED', by: 'Azizova M.' },
      40,
      { now: NOW, openUrl: OPEN },
    );
    expect(ok.text).toBe(
      '<b>Qabul qilindi</b>\nOktabr reklama banneri uchun matn\nAzizova M. qabul qildi. Rahmat.',
    );
    expect(labels(ok)).toEqual([['Ochish']]);
  });

  it('#5 a comment', () => {
    const m = renderTaskMessage(
      view(),
      { kind: 'COMMENT', by: 'Soliyev A.', text: 'Narx 450 000 qoldimi?' },
      40,
      { now: NOW, openUrl: OPEN },
    );
    expect(m.text).toBe(
      '<b>Yangi izoh</b>\nOktabr reklama banneri uchun matn\nSoliyev A.: «Narx 450 000 qoldimi?»',
    );
    expect(labels(m)).toEqual([['Ochish']]);
  });

  it('#6 reminder to the assignee; overdue names the assignees for the author', () => {
    const today = view({
      status: 'IN_PROGRESS',
      steps: [],
      dueAt: new Date('2026-10-07T05:00:00.000Z'),
    });
    const r = renderTaskMessage(today, { kind: 'REMINDER' }, 40, {
      now: new Date('2026-10-07T04:00:00.000Z'),
      openUrl: OPEN,
    });
    expect(r.text.split('\n')[0]).toBe('<b>1 soatdan keyin muddat tugaydi</b>');
    expect(r.text).toContain('Muddat: bugun, 10:00');
    expect(labels(r)).toEqual([['Bajardim'], ['Ochish']]);
    const late = renderTaskMessage(today, { kind: 'OVERDUE' }, 30, {
      now: NOW,
      openUrl: OPEN,
    });
    expect(late.text).toContain("<b>Muddati o'tdi</b>");
    expect(late.text).toContain('Ijrochi: Rahimov A.');
    expect(labels(late)).toEqual([['Ochish']]);
    expect(
      renderTaskMessage(today, { kind: 'OVERDUE' }, 40, { now: NOW }).text,
    ).not.toContain('Ijrochi:');
  });

  it('A9 a reminder headline uses the real remainder under 50 minutes', () => {
    const due = new Date('2026-10-07T05:00:00.000Z');
    const today = view({ status: 'IN_PROGRESS', steps: [], dueAt: due });
    const MIN = 60_000;
    const head = (msBefore: number) =>
      renderTaskMessage(today, { kind: 'REMINDER' }, 40, {
        now: new Date(due.getTime() - msBefore),
      }).text.split('\n')[0];
    expect(head(60 * MIN)).toBe('<b>1 soatdan keyin muddat tugaydi</b>');
    expect(head(50 * MIN)).toBe('<b>1 soatdan keyin muddat tugaydi</b>');
    expect(head(49 * MIN)).toBe('<b>Muddat tugashiga 49 daqiqa qoldi</b>');
    expect(head(5 * MIN)).toBe('<b>Muddat tugashiga 5 daqiqa qoldi</b>');
    // rounded up, never below 1 (even a hair past the deadline)
    expect(head(4 * MIN + 1)).toBe('<b>Muddat tugashiga 5 daqiqa qoldi</b>');
    expect(head(30_000)).toBe('<b>Muddat tugashiga 1 daqiqa qoldi</b>');
    expect(head(-MIN)).toBe('<b>Muddat tugashiga 1 daqiqa qoldi</b>');
    // no deadline: the plain headline
    expect(
      renderTaskMessage(view({ dueAt: null }), { kind: 'REMINDER' }, 40, {
        now: NOW,
      }).text.split('\n')[0],
    ).toBe('<b>1 soatdan keyin muddat tugaydi</b>');
  });

  it('#7 to a watcher: done and cancelled', () => {
    const done = renderTaskMessage(
      view({ status: 'DONE' }),
      { kind: 'DONE', by: 'Soliyev A.' },
      50,
      { now: NOW, openUrl: OPEN },
    );
    expect(done.text).toBe(
      '<b>Bajarildi</b>\nOktabr reklama banneri uchun matn\nIjrochi: Rahimov A.\nQabul qildi: Soliyev A.',
    );
    const off = renderTaskMessage(
      view({ status: 'CANCELLED' }),
      { kind: 'CANCELLED', by: 'Soliyev A.' },
      50,
      { now: NOW, openUrl: OPEN },
    );
    expect(off.text).toBe(
      '<b>Bekor qilindi</b>\nOktabr reklama banneri uchun matn\nBekor qildi: Soliyev A.',
    );
  });

  it('#8 added later and removed (no buttons at all when removed)', () => {
    const added = renderTaskMessage(
      view(),
      { kind: 'ADDED', by: 'Soliyev A.' },
      40,
      { now: NOW, openUrl: OPEN },
    );
    expect(added.text.split('\n').slice(0, 3)).toEqual([
      "<b>Siz topshiriqqa qo'shildingiz</b>",
      'Oktabr reklama banneri uchun matn',
      "Qo'shdi: Soliyev A.",
    ]);
    const removed = renderTaskMessage(
      view(),
      { kind: 'REMOVED', by: 'Soliyev A.' },
      40,
      { now: NOW, openUrl: OPEN },
    );
    expect(removed.text).toBe(
      '<b>Topshiriqdan olib tashlandingiz</b>\nOktabr reklama banneri uchun matn\nOlib tashladi: Soliyev A.',
    );
    expect(removed.buttons).toEqual([]);
  });

  it('a system task gets «Ochish» only, and «Bergan: Tizim»', () => {
    const m = renderTaskMessage(
      view({
        kind: 'UNCALLED_LEAD',
        authorId: null,
        authorName: null,
        steps: [],
      }),
      { kind: 'MOVED', from: 'Azizova M.' },
      40,
      { now: NOW, openUrl: OPEN },
    );
    expect(m.text).toContain('Bergan: Tizim');
    expect(m.text).toContain('Oldingi ijrochi: Azizova M.');
    expect(labels(m)).toEqual([['Ochish']]);
  });

  it('a «Topshiriqlarim» card has the title as its headline', () => {
    const m = renderTaskMessage(view(), { kind: 'CARD' }, 40, { now: NOW });
    expect(m.text.split('\n')[0]).toBe(
      '<b>Oktabr reklama banneri uchun matn</b>',
    );
    expect(m.text.split('\n')[1]).toBe('Bergan: Soliyev A.');
    expect(labels(m)).toEqual([['Boshladim', 'Bajardim'], ['Qadamlar']]); // no URL → no «Ochish»
  });

  it('escapes HTML in every text that comes from people', () => {
    const m = renderTaskMessage(
      view({ title: 'A <b> & C' }),
      { kind: 'COMMENT', by: 'X <i>', text: '1 < 2 & 3' },
      40,
      { now: NOW },
    );
    expect(m.text).toContain('A &lt;b&gt; &amp; C');
    expect(m.text).toContain('X &lt;i&gt;: «1 &lt; 2 &amp; 3»');
    const assigned = renderTaskMessage(
      view({ authorName: 'Au <u>', entityLabel: 'G <1>' }),
      { kind: 'ASSIGNED' },
      40,
      { now: NOW },
    );
    expect(assigned.text).toContain('Bergan: Au &lt;u&gt;');
    expect(assigned.text).toContain("Bog'liq: G &lt;1&gt;");
    const done = renderTaskMessage(
      view({
        participants: [{ userId: 40, role: 'ASSIGNEE', name: 'As & B' }],
      }),
      { kind: 'DONE', by: 'Q <q>' },
      30,
      { now: NOW },
    );
    expect(done.text).toContain('Ijrochi: As &amp; B');
    expect(done.text).toContain('Qabul qildi: Q &lt;q&gt;');
    const cardHeadline = renderTaskMessage(
      view({ title: 'T & <U>' }),
      { kind: 'CARD' },
      40,
      { now: NOW },
    );
    expect(cardHeadline.text.split('\n')[0]).toBe('<b>T &amp; &lt;U&gt;</b>');
    expect(esc('<a href="x">&</a>')).toBe('&lt;a href="x"&gt;&amp;&lt;/a&gt;');
  });

  it('A11 clips by code points: an emoji at the cut is not split', () => {
    const comment = (text: string) =>
      renderTaskMessage(view(), { kind: 'COMMENT', by: 'X', text }, 40, {
        now: NOW,
      }).text;
    // 299 letters + emoji + tail: the emoji is the 300th code point, kept whole
    const cut = comment('a'.repeat(299) + '😀' + 'tail');
    expect(cut).toContain(`X: «${'a'.repeat(299)}😀…»`);
    expect(cut).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(cut).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    // exactly 300 code points (301 UTF-16 units): not clipped at all
    expect(comment('a'.repeat(299) + '😀')).toContain(
      `X: «${'a'.repeat(299)}😀»`,
    );
    // the same rule for the step buttons (48)
    const long = view({
      steps: [{ id: 's1', title: 'b'.repeat(47) + '😀' + 'x', done: false }],
    });
    expect(labels(renderStepsMessage(long))[0][0]).toBe(
      `1. ${'b'.repeat(47)}😀…`,
    );
  });
});

describe('renderStepsMessage (mockup s17)', () => {
  it('lists the steps as toggles with ✓ and «Orqaga»', () => {
    const v = view({ steps: steps.map((s, i) => ({ ...s, done: i < 2 })) });
    const m = renderStepsMessage(v);
    expect(m.text).toBe(
      '<b>Kichik qadamlar · 2/5</b>\nBosib belgilang yoki belgini olib tashlang',
    );
    expect(labels(m)).toEqual([
      ['✓ 1. Matn qoralamasi'],
      ['✓ 2. Narxlarni tekshirish'],
      ['3. Dizaynerga yuborish'],
      ['4. Dizaynni tasdiqlatish'],
      ['5. Chop etishga berish'],
      ['Orqaga'],
    ]);
    expect(data(m)[0]).toBe('tk:step:step-1');
    expect(data(m)[5]).toBe(`tk:back:${TASK}`);
  });
});

describe('renderMyTasks (mockup s14 #10)', () => {
  it('groups overdue / today / later and numbers the buttons, 5 a row', () => {
    const now = new Date('2026-10-08T06:00:00.000Z'); // 08.10 11:00
    const m = renderMyTasks(
      [
        {
          id: 'a',
          title: 'Kassa hisobotini tekshirish',
          dueAt: new Date('2026-10-08T05:00:00.000Z'),
        },
        {
          id: 'b',
          title: '2-xonani tayyorlash',
          dueAt: new Date('2026-10-08T08:00:00.000Z'),
        },
        {
          id: 'c',
          title: "Qayta qo'ng'iroq: Karimova D.",
          dueAt: new Date('2026-10-08T13:00:00.000Z'),
        },
        {
          id: 'd',
          title: 'Oktabr banneri matni',
          dueAt: new Date('2026-10-09T13:00:00.000Z'),
        },
        {
          id: 'e',
          title: 'Shartnomani imzolatish',
          dueAt: new Date('2026-10-10T13:00:00.000Z'),
        },
        { id: 'f', title: 'Muddatsiz ish', dueAt: null },
      ],
      6,
      now,
    );
    expect(m.text).toBe(
      [
        '<b>Ochiq topshiriqlar: 6</b>',
        "<b>Muddati o'tgan</b>",
        '1. Kassa hisobotini tekshirish, 10:00',
        '<b>Bugun</b>',
        '2. 2-xonani tayyorlash, 13:00',
        "3. Qayta qo'ng'iroq: Karimova D., 18:00",
        '<b>Keyinroq</b>',
        '4. Oktabr banneri matni, 09.10',
        '5. Shartnomani imzolatish, 10.10',
        '6. Muddatsiz ish',
      ].join('\n'),
    );
    expect(labels(m)).toEqual([['1', '2', '3', '4', '5'], ['6']]);
    expect(data(m)[0]).toBe('tk:show:a');
  });

  it('says how many more there are, and when there is nothing', () => {
    const now = new Date('2026-10-08T06:00:00.000Z');
    expect(
      renderMyTasks([{ id: 'a', title: 'X', dueAt: null }], 14, now).text,
    ).toContain('Yana 13 ta topshiriq saytda.');
    expect(renderMyTasks([], 0, now)).toEqual({
      text: "Sizda ochiq topshiriq yo'q.",
      buttons: [],
    });
  });

  it('escapes the title (after clipping, so an entity is never cut)', () => {
    const now = new Date('2026-10-08T06:00:00.000Z');
    const m = renderMyTasks(
      [{ id: 'a', title: 'A & <B> ' + '&'.repeat(70), dueAt: null }],
      1,
      now,
    );
    expect(m.text).toContain('1. A &amp; &lt;B&gt; ');
    expect(m.text).not.toMatch(/&(?!amp;|lt;|gt;)/);
  });
});

describe('helpers', () => {
  it('callback data round-trips and never exceeds 64 bytes', () => {
    for (const action of [
      'start',
      'done',
      'accept',
      'return',
      'steps',
      'back',
      'show',
      'step',
    ] as const) {
      const d = tkData(action, TASK);
      expect(Buffer.byteLength(d)).toBeLessThanOrEqual(64);
      expect(parseTk(d)).toEqual({ action, id: TASK });
    }
    expect(parseTk('tk:list')).toEqual({ action: 'list', id: '' });
    expect(parseTk('tk:start')).toBeNull();
    expect(parseTk('tk:list:x')).toBeNull();
    expect(parseTk('tk:nope:x')).toBeNull();
    expect(parseTk('menu_payments')).toBeNull();
    expect(() => tkData('show', 'x'.repeat(60))).toThrow();
  });

  it('dueLabel: bugun / ertaga / dd.MM on the Tashkent clock', () => {
    const now = new Date('2026-10-07T20:30:00.000Z'); // 08.10 01:30 Tashkent
    expect(dueLabel(new Date('2026-10-08T08:00:00.000Z'), now)).toBe(
      'bugun, 13:00',
    );
    expect(dueLabel(new Date('2026-10-09T03:30:00.000Z'), now)).toBe(
      'ertaga, 08:30',
    );
    expect(dueLabel(new Date('2026-10-11T13:00:00.000Z'), now)).toBe(
      '11.10, 18:00',
    );
  });

  it('keptHeadline keeps a notice headline, not a title or the step list', () => {
    expect(keptHeadline('Yangi topshiriq · Yuqori\nX', 'X')).toBe(
      'Yangi topshiriq · Yuqori',
    );
    expect(keptHeadline('X\nMuddat: …', 'X')).toBeUndefined();
    expect(keptHeadline('Kichik qadamlar · 2/5\n…', 'X')).toBeUndefined();
    expect(keptHeadline(undefined, 'X')).toBeUndefined();
  });

  it('shortName, isSelfTask, returnedReply', () => {
    expect(shortName('Ahror', 'Soliyev')).toBe('Soliyev A.');
    expect(shortName('Ahror', '')).toBe('Ahror');
    expect(isSelfTask(view({ authorId: 40 }), 40)).toBe(true);
    expect(isSelfTask(view(), 40)).toBe(false);
    expect(returnedReply(['Rahimov A.'])).toBe(
      'Topshiriq qaytarildi. Rahimov A. ga xabar ketdi.',
    );
    expect(returnedReply([])).toBe('Topshiriq qaytarildi.');
  });
});
