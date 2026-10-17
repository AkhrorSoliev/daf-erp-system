import { parseReportAction, reportKeyboard } from './report-keyboard';

const rows = (k: ReturnType<typeof reportKeyboard>) =>
  k.reply_markup.inline_keyboard.map((r) =>
    r.map((b) =>
      'callback_data' in b ? `${b.text}|${b.callback_data}` : b.text,
    ),
  );

describe('reportKeyboard', () => {
  it('branch buttons, «Barchasi» and «Yangilash» for several branches', () => {
    const k = reportKeyboard(
      [
        { id: 1, name: "Farg'ona" },
        { id: 2, name: 'Namangan' },
      ],
      'all',
    );
    expect(rows(k)).toEqual([
      ["Farg'ona|tr:b:1", 'Namangan|tr:b:2', '• 🌐 Barchasi|tr:all'],
      ['🔄 Yangilash|tr:r:all'],
    ]);
  });

  it('marks the focused branch and refreshes it', () => {
    const k = reportKeyboard(
      [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
      2,
    );
    expect(rows(k)[0][1]).toBe('• B|tr:b:2');
    expect(rows(k)[1]).toEqual(['🔄 Yangilash|tr:r:2']);
  });

  it('one branch: only «Yangilash»', () => {
    expect(rows(reportKeyboard([{ id: 1, name: 'A' }], 'all'))).toEqual([
      ['🔄 Yangilash|tr:r:all'],
    ]);
  });

  it('wraps branch buttons three to a row', () => {
    const k = reportKeyboard(
      [1, 2, 3, 4].map((id) => ({ id, name: `F${id}` })),
      'all',
    );
    expect(rows(k)[0]).toHaveLength(3);
    expect(rows(k)[1]).toHaveLength(2);
  });
});

describe('parseReportAction', () => {
  it.each([
    ['tr:open', { kind: 'open' }],
    ['tr:all', { kind: 'focus', focus: 'all' }],
    ['tr:b:7', { kind: 'focus', focus: 7 }],
    ['tr:r:all', { kind: 'focus', focus: 'all' }],
    ['tr:r:12', { kind: 'focus', focus: 12 }],
  ])('%s', (data, want) => expect(parseReportAction(data)).toEqual(want));

  it.each([
    'tr:b:x',
    'tr:b:',
    'tr:b:1.5',
    'tk:list',
    'tr:zzz',
    'tr:b:9999999999',
  ])('rejects %s', (d) => expect(parseReportAction(d)).toBeNull());
});
