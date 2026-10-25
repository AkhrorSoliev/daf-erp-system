import {
  PROFILE_REQUEST_MARKER,
  buildRequestKeyboard,
  buildRequestText,
  missingProfileFields,
  parseProfileCallback,
  profileCb,
} from './profile-request-text';

describe('missingProfileFields', () => {
  it('lists only what is empty', () => {
    expect(missingProfileFields({ gender: null, dateOfBirth: null })).toEqual([
      'gender',
      'dateOfBirth',
    ]);
    expect(missingProfileFields({ gender: 'MALE', dateOfBirth: null })).toEqual(
      ['dateOfBirth'],
    );
    expect(
      missingProfileFields({ gender: null, dateOfBirth: new Date() }),
    ).toEqual(['gender']);
  });
});

describe('buildRequestText', () => {
  it('is the one soft message', () => {
    expect(buildRequestText('Aziz')).toBe(
      "Assalomu alaykum, Aziz! 😊\n\nMarkazimizda siz haqingizda ba'zi ma'lumotlar yetishmayapti. Ular bizning statistikamiz uchun kerak edi, o'quvchilarimizni yaxshiroq tushunishga yordam beradi.\n\nPastdagi tugmani bosing, bir necha soniya vaqtingizni oladi. Rahmat! 🙏",
    );
  });
  it('carries the marker and names no documents', () => {
    const t = buildRequestText('A');
    expect(t).toContain(PROFILE_REQUEST_MARKER);
    expect(PROFILE_REQUEST_MARKER).toBe('Pastdagi tugmani bosing');
    expect(t.toLowerCase()).not.toContain('shartnoma');
    expect(t.toLowerCase()).not.toContain('guvohnoma');
  });
  it('escapes the name for HTML', () => {
    expect(buildRequestText('<b>x')).toContain('&lt;b&gt;x');
  });
});

describe('callbacks', () => {
  const big = 2147483647;
  it('round-trips every callback under 64 bytes', () => {
    const cases: [string, object][] = [
      [profileCb.start(big), { kind: 'start', studentId: big }],
      [
        profileCb.gender(big, 'F'),
        { kind: 'gender', studentId: big, gender: 'F' },
      ],
      [
        profileCb.decades(big, 'N'),
        { kind: 'decades', studentId: big, g: 'N' },
      ],
      [
        profileCb.decade(big, 'M', 1980),
        { kind: 'decade', studentId: big, g: 'M', decade: 1980 },
      ],
      [
        profileCb.year(big, 'F', 2005),
        { kind: 'year', studentId: big, g: 'F', year: 2005 },
      ],
      [
        profileCb.month(big, 'N', 2005, 3),
        { kind: 'month', studentId: big, g: 'N', year: 2005, month: 3 },
      ],
      [
        profileCb.review(big, 'M', '2005-03-15'),
        { kind: 'review', studentId: big, g: 'M', iso: '2005-03-15' },
      ],
      [
        profileCb.save(big, 'F', '2005-03-15'),
        { kind: 'save', studentId: big, g: 'F', iso: '2005-03-15' },
      ],
      [
        profileCb.save(big, 'M', null),
        { kind: 'save', studentId: big, g: 'M', iso: null },
      ],
      [profileCb.cancel(big), { kind: 'cancel', studentId: big }],
    ];
    for (const [data, action] of cases) {
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
      expect(parseProfileCallback(data)).toEqual(action);
    }
    expect(profileCb.month(1, 'M', 2005, 3)).toBe('pf:dm:1:M:2005-03');
    expect(profileCb.save(1, 'M', null)).toBe('pf:ds:1:M:-');
  });
  it.each([
    'other',
    'pf:s',
    'pf:s:',
    'pf:s:1.5',
    'pf:g:5',
    'pf:g:abc:M',
    'pf:g:5:N',
    'pf:g:5:X',
    'pf:d:5',
    'pf:p:g',
    'pf:l:5',
    'pf:dl:5:X',
    'pf:dd:5:M:198',
    'pf:dd:5:M:19800',
    'pf:dd:5:1980',
    'pf:dy:5:M:20x5',
    'pf:dm:5:M:2005-3',
    'pf:dm:5:M:2005-03-01',
    'pf:dc:5:M:2005-3-15',
    'pf:dc:5:M:-',
    'pf:ds:5:M:2005-03-15x',
    'pf:ds:5:Q:2005-03-15',
    'pf:ds::M:2005-03-15',
    'pf:x',
    'pf:x:',
    'pf:x:1.5',
    'xpf:x:5',
    'pf:x:5 ',
  ])('rejects %s', (bad) => expect(parseProfileCallback(bad)).toBeNull());
});

describe('buildRequestKeyboard', () => {
  const buttons = (k: ReturnType<typeof buildRequestKeyboard>) =>
    k.reply_markup.inline_keyboard.flat() as any[];
  it('has exactly one button', () => {
    const b = buttons(buildRequestKeyboard(7));
    expect(b).toHaveLength(1);
    expect(b[0].text).toBe("📝 Ma'lumotlarni kiritish");
    expect(b[0].callback_data).toBe('pf:s:7');
  });
  it('preview uses student id 0', () => {
    expect(buttons(buildRequestKeyboard('preview'))[0].callback_data).toBe(
      'pf:s:0',
    );
  });
});
