import {
  joinRequestApprovedText,
  joinRequestExpiredText,
  joinRequestReceivedText,
  joinRequestRejectedText,
  loginText,
  pendingRequestNotice,
  scheduleText,
} from './join-request-texts';

// Spec 2026-10-10-guruhga-qoshilish-tasdigi §9, approved by the CEO on
// 10.10.2026 — these tests pin every line.
const GROUP = {
  firstName: 'Dilnoza',
  groupName: 'A1 Standart 15:00',
  teacherName: 'Madina Karimova',
  schedule: 'Toq kunlar | 15:00 – 16:30',
};

describe('join request texts', () => {
  it('the request received message', () => {
    expect(joinRequestReceivedText(GROUP)).toBe(
      [
        "✅ <b>So'rovingiz qabul qilindi</b>",
        '',
        'Hurmatli <b>Dilnoza</b>!',
        "Siz <b>A1 Standart 15:00</b> guruhiga yozilish uchun so'rov yubordingiz.",
        '',
        "👨‍🏫 O'qituvchi: Madina Karimova",
        '🕐 Dars vaqti: Toq kunlar | 15:00 – 16:30',
        '',
        "Administrator so'rovingizni ko'rib chiqib, shu yerga xabar beradi. Odatda bu bir ish kuni ichida bo'ladi.",
        'Rahmat!',
      ].join('\n'),
    );
  });

  it('leaves out the teacher and time lines when the group has neither', () => {
    const text = joinRequestReceivedText({
      ...GROUP,
      teacherName: null,
      schedule: null,
    });
    expect(text).not.toContain("O'qituvchi");
    expect(text).not.toContain('Dars vaqti');
    expect(text).not.toContain('\n\n\n');
  });

  it('the approval message, with the login and the password', () => {
    expect(
      joinRequestApprovedText({
        ...GROUP,
        phone: '901234567',
        password: 'k7Pq2xZa',
      }),
    ).toBe(
      [
        '🎉 <b>Siz guruhga qabul qilindingiz!</b>',
        '',
        'Hurmatli <b>Dilnoza</b>!',
        "So'rovingiz tasdiqlandi.",
        '',
        '📚 Guruh: <b>A1 Standart 15:00</b>',
        "👨‍🏫 O'qituvchi: Madina Karimova",
        '🕐 Dars vaqti: Toq kunlar | 15:00 – 16:30',
        '',
        '🔐 <b>Shaxsiy kabinetingiz</b>',
        '🌐 student.dafzentrum.uz',
        '📱 Login: <b>90 123 45 67</b>',
        '🔑 Parol: <b>k7Pq2xZa</b>',
        '',
        "Darslarda ko'rishguncha!",
      ].join('\n'),
    );
  });

  it('the rejection message never carries the reason', () => {
    expect(
      joinRequestRejectedText({
        firstName: 'Dilnoza',
        groupName: 'A1 Standart 15:00',
        phone: '900000000',
      }),
    ).toBe(
      [
        "ℹ️ <b>So'rovingiz tasdiqlanmadi</b>",
        '',
        'Hurmatli <b>Dilnoza</b>!',
        "<b>A1 Standart 15:00</b> guruhiga yozilish bo'yicha so'rovingiz tasdiqlanmadi.",
        '',
        "Savolingiz bo'lsa yoki bu xato deb o'ylasangiz, administrator bilan bog'laning:",
        '📞 +998 90 000 00 00',
        '',
        'Rahmat!',
      ].join('\n'),
    );
  });

  it('the expiry message', () => {
    expect(
      joinRequestExpiredText({
        firstName: 'Dilnoza',
        groupName: 'A1 Standart 15:00',
        phone: '900000000',
      }),
    ).toBe(
      [
        "⏳ <b>So'rovingiz ko'rib chiqilmadi</b>",
        '',
        'Hurmatli <b>Dilnoza</b>!',
        "<b>A1 Standart 15:00</b> guruhiga yozilish bo'yicha so'rovingizni 7 kun ichida ko'rib chiqa olmadik. Uzr so'raymiz.",
        '',
        "Iltimos, administrator bilan bog'laning — birga hal qilamiz:",
        '📞 +998 90 000 00 00',
        '',
        'Rahmat!',
      ].join('\n'),
    );
  });

  it('drops the phone line, and its colon, when neither branch nor company has a phone', () => {
    const text = joinRequestExpiredText({
      firstName: 'Dilnoza',
      groupName: 'A1',
      phone: null,
    });
    expect(text).not.toContain('📞');
    expect(text).toContain('birga hal qilamiz.\n\nRahmat!');
  });

  it('escapes what the person typed', () => {
    expect(
      joinRequestReceivedText({ ...GROUP, firstName: '<i>x</i>' }),
    ).toContain('Hurmatli <b>&lt;i&gt;x&lt;/i&gt;</b>!');
  });

  describe('escapes every value it prints, not only the name', () => {
    const NASTY = {
      firstName: 'A&B',
      groupName: '<b>A1</b>',
      teacherName: 'Ali <Vali>',
      schedule: 'Du & Pa',
    };

    it('the request received message', () => {
      const text = joinRequestReceivedText(NASTY);
      expect(text).toContain('Hurmatli <b>A&amp;B</b>!');
      expect(text).toContain('Siz <b>&lt;b&gt;A1&lt;/b&gt;</b> guruhiga');
      expect(text).toContain("O'qituvchi: Ali &lt;Vali&gt;");
      expect(text).toContain('Dars vaqti: Du &amp; Pa');
    });

    it('the approval message, the login and the password included', () => {
      const text = joinRequestApprovedText({
        ...NASTY,
        phone: '+49<1>',
        password: 'a<b>&c',
      });
      expect(text).toContain('📚 Guruh: <b>&lt;b&gt;A1&lt;/b&gt;</b>');
      expect(text).toContain("O'qituvchi: Ali &lt;Vali&gt;");
      expect(text).toContain('Dars vaqti: Du &amp; Pa');
      expect(text).toContain('📱 Login: <b>+49&lt;1&gt;</b>');
      expect(text).toContain('🔑 Parol: <b>a&lt;b&gt;&amp;c</b>');
    });

    it.each([
      ['rejection', joinRequestRejectedText],
      ['expiry', joinRequestExpiredText],
    ])('the %s message', (_name, build) => {
      const text = build({ ...NASTY, phone: null });
      expect(text).toContain('Hurmatli <b>A&amp;B</b>!');
      expect(text).toContain('<b>&lt;b&gt;A1&lt;/b&gt;</b> guruhiga');
    });
  });

  it('the notice for a chat that already waits', () => {
    expect(pendingRequestNotice('A1-07')).toBe(
      "Sizda ko'rib chiqilayotgan so'rov bor: A1-07. Yangisini yuborsangiz, avvalgisi bekor bo'ladi.",
    );
  });

  it('reads the schedule like the group card', () => {
    expect(
      scheduleText({
        days: 'odd',
        exactDays: [],
        lessonStartTime: '15:00',
        lessonEndTime: '16:30',
      }),
    ).toBe('Toq kunlar | 15:00 – 16:30');
    expect(
      scheduleText({
        days: null,
        exactDays: ['monday', 'thursday'],
        lessonStartTime: null,
        lessonEndTime: null,
      }),
    ).toBe('Du, Pa');
    expect(
      scheduleText({
        days: null,
        exactDays: [],
        lessonStartTime: null,
        lessonEndTime: null,
      }),
    ).toBeNull();
  });

  it('writes a 9-digit login with spaces and leaves a foreign one as it is', () => {
    expect(loginText('901234567')).toBe('90 123 45 67');
    expect(loginText('491701234567')).toBe('491701234567');
  });
});
