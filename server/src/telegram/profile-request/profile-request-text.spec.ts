import {
  PROFILE_REQUEST_MARKER,
  buildCancelKeyboard,
  buildRequestKeyboard,
  buildRequestText,
  missingProfileFields,
  parseBirthDateInput,
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
  it('gives a true reason per variant and always carries the marker', () => {
    const both = buildRequestText('Aziz', ['gender', 'dateOfBirth']);
    const g = buildRequestText('Aziz', ['gender']);
    const d = buildRequestText('Aziz', ['dateOfBirth']);
    expect(both).toContain("Kartangizda jinsingiz va tug'ilgan sanangiz yo'q.");
    expect(both).toContain('markaz hisobotlari uchun kerak');
    expect(g).toContain("Kartangizda jinsingiz yo'q.");
    expect(g).not.toContain('shartnoma');
    expect(d).toContain("Kartangizda tug'ilgan sanangiz yo'q.");
    expect(d).toContain('shartnoma va ishtirok guvohnomasi');
    for (const t of [both, g, d]) {
      expect(t).toContain('Assalomu alaykum, Aziz!');
      expect(t).toContain(PROFILE_REQUEST_MARKER);
      expect(t).toContain(
        'Pastdagi tugmalar orqali kiriting — bir daqiqa. Rahmat!',
      );
    }
  });
  it('escapes the name for HTML', () => {
    expect(buildRequestText('<b>x', ['gender'])).toContain('&lt;b&gt;x');
  });
});

describe('callbacks', () => {
  it('round-trips and stays under 64 bytes', () => {
    const g = profileCb.gender(2147483647, 'FEMALE');
    expect(Buffer.byteLength(g)).toBeLessThanOrEqual(64);
    expect(parseProfileCallback(g)).toEqual({
      kind: 'gender',
      studentId: 2147483647,
      gender: 'FEMALE',
    });
    expect(parseProfileCallback(profileCb.date(12))).toEqual({
      kind: 'date',
      studentId: 12,
    });
    expect(parseProfileCallback(profileCb.preview('gender'))).toEqual({
      kind: 'preview',
      step: 'gender',
    });
  });
  it.each([
    'pf:g:abc:M',
    'pf:g:5:X',
    'pf:x:5',
    'other',
    'pf:x',
    'pf:d:',
    'pf:d:1.5',
  ])('rejects %s', (bad) => expect(parseProfileCallback(bad)).toBeNull());
});

describe('buildRequestKeyboard', () => {
  const rows = (k: ReturnType<typeof buildRequestKeyboard>) =>
    k.reply_markup.inline_keyboard.flat().map((b: any) => b.callback_data);
  it('offers only what is missing', () => {
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
  });
  it('uses preview callbacks that carry no student id', () => {
    expect(
      rows(buildRequestKeyboard('preview', ['gender', 'dateOfBirth'])),
    ).toEqual(['pf:p:g', 'pf:p:g', 'pf:p:d']);
  });
});

describe('buildCancelKeyboard', () => {
  it('has one cancel button with pf:x', () => {
    const b =
      buildCancelKeyboard().reply_markup.inline_keyboard.flat() as any[];
    expect(b).toHaveLength(1);
    expect(b[0].text).toBe('Bekor qilish');
    expect(b[0].callback_data).toBe('pf:x');
  });
});

describe('parseBirthDateInput', () => {
  const today = '2026-10-25';
  it('accepts dd.mm.yyyy and loose separators', () => {
    expect(parseBirthDateInput('15.03.2005', today)).toEqual({
      ok: true,
      iso: '2005-03-15',
    });
    expect(parseBirthDateInput(' 5/3/2005 ', today)).toEqual({
      ok: true,
      iso: '2005-03-05',
    });
  });
  it.each(['2005', 'salom', '', '15.03.05', '2005-03-15'])(
    'asks again for the format on %p',
    (t) => {
      const r = parseBirthDateInput(t, today);
      expect(r.ok).toBe(false);
    },
  );
  it('returns the rule message for impossible or out-of-range dates', () => {
    const feb = parseBirthDateInput('30.02.2005', today);
    expect(feb).toEqual({
      ok: false,
      message: "Tug'ilgan sana noto'g'ri. Qayta yozing, masalan: 15.03.2005",
    });
    const future = parseBirthDateInput('01.01.2030', today);
    expect(future.ok).toBe(false);
    const young = parseBirthDateInput('01.01.2024', today);
    expect(young).toEqual({
      ok: false,
      message:
        "Yosh 5 dan 100 gacha bo'lishi kerak. Qayta yozing, masalan: 15.03.2005",
    });
  });
});
