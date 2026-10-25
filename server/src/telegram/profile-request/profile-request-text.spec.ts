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
  it('uses the exact text per variant', () => {
    expect(buildRequestText('Aziz', ['dateOfBirth'])).toBe(
      "Assalomu alaykum, Aziz!\n\nTug'ilgan sanangiz bizda yo'q. Hujjatlaringiz (shartnoma, ishtirok guvohnomasi) xatosiz tayyorlanishi uchun kerak.\n\nTugmani bosib kiriting. Rahmat!",
    );
    expect(buildRequestText('Aziz', ['gender'])).toBe(
      "Assalomu alaykum, Aziz!\n\nJinsingiz bizda yo'q. U markaz hisobotlari to'g'ri chiqishi uchun kerak.\n\nTugmani bosib kiriting. Rahmat!",
    );
    expect(buildRequestText('Aziz', ['gender', 'dateOfBirth'])).toBe(
      "Assalomu alaykum, Aziz!\n\nJinsingiz va tug'ilgan sanangiz bizda yo'q. Tug'ilgan sana hujjatlaringiz (shartnoma, ishtirok guvohnomasi) xatosiz tayyorlanishi uchun, jins esa markaz hisobotlari uchun kerak.\n\nTugmalarni bosib kiriting. Rahmat!",
    );
  });
  it('always carries the marker; gender-only never mentions the contract', () => {
    for (const m of [
      ['gender'],
      ['dateOfBirth'],
      ['gender', 'dateOfBirth'],
    ] as const) {
      expect(buildRequestText('A', [...m])).toContain(PROFILE_REQUEST_MARKER);
    }
    expect(PROFILE_REQUEST_MARKER).toBe('bosib kiriting. Rahmat!');
    expect(buildRequestText('A', ['gender'])).not.toContain('shartnoma');
  });
  it('escapes the name for HTML', () => {
    expect(buildRequestText('<b>x', ['gender'])).toContain('&lt;b&gt;x');
  });
});

describe('callbacks', () => {
  const big = 2147483647;
  it('round-trips every callback under 64 bytes', () => {
    const cases: [string, object][] = [
      [
        profileCb.gender(big, 'FEMALE'),
        { kind: 'gender', studentId: big, gender: 'FEMALE' },
      ],
      [profileCb.date(12), { kind: 'date', studentId: 12 }],
      [
        profileCb.decade(big, 1980),
        { kind: 'decade', studentId: big, decade: 1980 },
      ],
      [profileCb.year(big, 2005), { kind: 'year', studentId: big, year: 2005 }],
      [
        profileCb.month(big, 2005, 3),
        { kind: 'month', studentId: big, year: 2005, month: 3 },
      ],
      [
        profileCb.confirm(big, '2005-03-15'),
        { kind: 'confirm', studentId: big, iso: '2005-03-15' },
      ],
      [
        profileCb.save(big, '2005-03-15'),
        { kind: 'save', studentId: big, iso: '2005-03-15' },
      ],
      [profileCb.cancel(), { kind: 'cancel' }],
      [profileCb.preview(), { kind: 'preview' }],
    ];
    for (const [data, action] of cases) {
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
      expect(parseProfileCallback(data)).toEqual(action);
    }
    expect(profileCb.month(1, 2005, 3)).toBe('pf:dm:1:2005-03');
  });
  it.each([
    'pf:g:abc:M',
    'pf:g:5:X',
    'pf:x:5',
    'other',
    'pf:d:',
    'pf:d:1.5',
    'pf:dd:5:198',
    'pf:dd:5:19800',
    'pf:dy:5:20x5',
    'pf:dm:5:2005-3',
    'pf:dm:5:2005-03-01',
    'pf:dc:5:2005-3-15',
    'pf:ds:5:2005-03-15x',
    'pf:ds::2005-03-15',
    'xpf:x',
    'pf:x ',
  ])('rejects %s', (bad) => expect(parseProfileCallback(bad)).toBeNull());
});

describe('buildRequestKeyboard', () => {
  const rows = (k: ReturnType<typeof buildRequestKeyboard>) =>
    k.reply_markup.inline_keyboard.flat().map((b: any) => b.callback_data);
  it('offers only what is missing, with the new date label', () => {
    expect(rows(buildRequestKeyboard(7, ['gender', 'dateOfBirth']))).toEqual([
      'pf:g:7:M',
      'pf:g:7:F',
      'pf:d:7',
    ]);
    expect(rows(buildRequestKeyboard(7, ['dateOfBirth']))).toEqual(['pf:d:7']);
    expect(rows(buildRequestKeyboard(7, ['gender']))).toEqual([
      'pf:g:7:M',
      'pf:g:7:F',
    ]);
    const btn = buildRequestKeyboard(7, ['dateOfBirth']).reply_markup
      .inline_keyboard[0][0] as any;
    expect(btn.text).toBe('📅 Sanani kiritish');
  });
  it('preview uses student id 0 for the date button', () => {
    expect(
      rows(buildRequestKeyboard('preview', ['gender', 'dateOfBirth'])),
    ).toEqual(['pf:p:g', 'pf:p:g', 'pf:d:0']);
  });
});
