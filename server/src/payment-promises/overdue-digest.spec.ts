import {
  formatUzPhone,
  overdueDigest,
  shortName,
  type OverdueDigestItem,
} from './overdue-digest';

const item = (over: Partial<OverdueDigestItem> = {}): OverdueDigestItem => ({
  studentName: 'Rahimxonov Xayrulloxon',
  debt: 115_385,
  debtAtPromise: 115_385,
  groups: [{ name: '#006', teacher: 'Karimova A.', frozen: false }],
  phone: '931234540',
  parentPhone: null,
  promiseDate: '2026-10-09',
  comment: "Qisman to'lov 250 000 so'm; qolgan 115 385 so'm",
  createdBy: 'Jamoliddinova M.',
  brokenCount: 1,
  ...over,
});

describe('overdueDigest', () => {
  it('lists the branch promises in one message', () => {
    const d = overdueDigest(
      [
        item(),
        item({
          studentName: 'Axmadjanov Sherzodbek',
          debt: 425_000,
          debtAtPromise: 425_000,
        }),
      ],
      'Namangan filiali',
      '2026-10-10',
    );
    expect(d.title).toBe("Bugun 2 ta to'lov va'dasi bajarilmadi");
    expect(d.summary).toBe(
      "Rahimxonov Xayrulloxon, Axmadjanov Sherzodbek — qo'ng'iroq qiling",
    );
    expect(d.telegram).toHaveLength(1);
    expect(d.telegram[0]).toBe(
      [
        "⏰ <b>Bugun 2 ta to'lov va'dasi bajarilmadi</b>",
        'Namangan filiali · 10.10',
        '',
        "1. <b>Rahimxonov Xayrulloxon</b> — qarz 115 385 so'm",
        '   #006, ustoz Karimova A. · 📞 +998 93 123 45 40',
        "   Va'da: 09.10 · «Qisman to'lov 250 000 so'm; qolgan 115 385 so'm» (Jamoliddinova M.)",
        "   Va'dadan beri to'lov yo'q",
        '',
        "2. <b>Axmadjanov Sherzodbek</b> — qarz 425 000 so'm",
        '   #006, ustoz Karimova A. · 📞 +998 93 123 45 40',
        "   Va'da: 09.10 · «Qisman to'lov 250 000 so'm; qolgan 115 385 so'm» (Jamoliddinova M.)",
        "   Va'dadan beri to'lov yo'q",
        '',
        "Qo'ng'iroq qilib, natijasini «Qo'ng'iroq natijasi»ga yozing.",
        'https://admin.dafzentrum.uz/payments/debt?promise=broken',
      ].join('\n'),
    );
  });

  it('says what changed since the promise and how often it was broken', () => {
    const [text] = overdueDigest(
      [
        item({
          debt: 75_385,
          debtAtPromise: 115_385,
          brokenCount: 3,
          parentPhone: '907654321',
          groups: [
            { name: '#029', teacher: null, frozen: true },
            { name: '#067', teacher: 'Murtazoxonov J.', frozen: false },
          ],
        }),
      ],
      'Farg‘ona',
      '2026-10-10',
    ).telegram;
    expect(text).toContain(
      '#029 (muzlatilgan); #067, ustoz Murtazoxonov J. · 📞 +998 93 123 45 40 · ota-ona +998 90 765 43 21',
    );
    expect(text).toContain(
      "Va'da paytida qarz 115 385 so'm edi · 3-marta buzildi",
    );
  });

  it('escapes names and comments for Telegram HTML', () => {
    const [text] = overdueDigest(
      [item({ studentName: 'A <b>', comment: 'x & y' })],
      'F&F',
      '2026-10-10',
    ).telegram;
    expect(text).toContain('<b>A &lt;b&gt;</b>');
    expect(text).toContain('«x &amp; y»');
    expect(text).toContain('F&amp;F · 10.10');
  });

  it('names at most three students in the bell', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].map((n) => item({ studentName: n }));
    expect(overdueDigest(many, null, '2026-10-10').summary).toBe(
      "A, B, C va yana 2 ta — qo'ng'iroq qiling",
    );
  });

  it('splits a long list under the Telegram limit', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      item({ studentName: `O'quvchi ${i + 1}` }),
    );
    const { telegram } = overdueDigest(many, 'Filial', '2026-10-10');
    expect(telegram.length).toBeGreaterThan(1);
    for (const part of telegram) expect(part.length).toBeLessThanOrEqual(3_900);
    expect(telegram.join('\n')).toContain("40. <b>O'quvchi 40</b>");
    expect(telegram[telegram.length - 1]).toContain('promise=broken');
  });
});

describe('helpers', () => {
  it('formats phones and short names', () => {
    expect(formatUzPhone('901234567')).toBe('+998 90 123 45 67');
    expect(formatUzPhone('79161234567')).toBe('+79161234567');
    expect(formatUzPhone(null)).toBeNull();
    expect(
      shortName({ firstName: ' Jahongir', lastName: 'Murtazoxonov ' }),
    ).toBe('Murtazoxonov J.');
  });
});
