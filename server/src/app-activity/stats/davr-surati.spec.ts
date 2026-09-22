import { davrOynasi } from './davr';
import { davrSurati } from './davr-surati';
import { SeansSatri } from './kunlik-faollik';
import { MashqUrinishi } from './mashq-natijasi';

const NOW = new Date('2026-09-13T05:00:00Z');
const oyna = davrOynasi(7, NOW, new Date('2026-01-01'), '2026-09-10'); // hisobBoshi 10.09, maxraj 4

const seans = (day: string, o: Partial<SeansSatri> = {}): SeansSatri => ({
  day,
  firstSeenAt: new Date(`${day}T05:00:00Z`),
  lastSeenAt: new Date(`${day}T06:00:00Z`),
  activeSeconds: 600,
  radioSeconds: 0,
  platform: 'WEB',
  sections: { LERNEN: 600 },
  ...o,
});
const urinish = (
  iso: string,
  o: Partial<MashqUrinishi> = {},
): MashqUrinishi => ({
  sessionId: 's1',
  questionIndex: 0,
  attemptNo: 1,
  format: 'WORT_UZ',
  score: 1,
  gradingStatus: 'GRADED',
  createdAt: new Date(iso),
  ...o,
});

describe('davrSurati', () => {
  it('faqat kirish (mashqsiz, radiosiz) shug`ullangan emas', () => {
    const s = davrSurati(oyna, [seans('2026-09-13')], []);
    expect(s.shugullanganKunlar).toBe(0);
    expect(s.kirdi).toBe(true);
    expect(s.faolSoniya).toBe(600);
    expect(s.kunlar.find((k) => k.sana === '2026-09-13')).toMatchObject({
      kirdi: true,
      shugullangan: false,
    });
  });

  it('bitta urinish (eski DiB yo`li ham) kunni shug`ullangan qiladi', () => {
    const s = davrSurati(
      oyna,
      [],
      [
        urinish('2026-09-12T05:00:00Z', {
          sessionId: null,
          questionIndex: null,
        }),
      ],
    );
    expect(s.shugullanganKunlar).toBe(1);
    expect(s.mashq.savollar).toBe(0);
  });

  it('radio 299 s — yo`q, ikki seans yig`indisi 300 s — ha', () => {
    const yoq = davrSurati(
      oyna,
      [
        seans('2026-09-13', {
          activeSeconds: 0,
          radioSeconds: 299,
          sections: {},
        }),
      ],
      [],
    );
    expect(yoq.shugullanganKunlar).toBe(0);
    const ha = davrSurati(
      oyna,
      [
        seans('2026-09-13', {
          activeSeconds: 0,
          radioSeconds: 150,
          sections: {},
        }),
        seans('2026-09-13', {
          activeSeconds: 0,
          radioSeconds: 150,
          sections: {},
          firstSeenAt: new Date('2026-09-13T08:00:00Z'),
          lastSeenAt: new Date('2026-09-13T09:00:00Z'),
        }),
      ],
      [],
    );
    expect(ha.shugullanganKunlar).toBe(1);
  });

  it('kuzatuvdan oldingi mashq kuni suratga kirmaydi, lekin kun ustunida kuzatilgan=false', () => {
    const s = davrSurati(oyna, [], [urinish('2026-09-08T05:00:00Z')]);
    expect(s.shugullanganKunlar).toBe(0);
    const kun = s.kunlar.find((k) => k.sana === '2026-09-08')!;
    expect(kun).toMatchObject({
      kuzatilgan: false,
      shugullangan: false,
      savollar: 1,
    });
  });

  it('kirdi: faqat 9 s li seans — yo`q', () => {
    expect(
      davrSurati(
        oyna,
        [seans('2026-09-13', { activeSeconds: 9, sections: {} })],
        [],
      ).kirdi,
    ).toBe(false);
  });

  it('davrdan tashqaridagi seans va urinish hisobga kirmaydi', () => {
    const s = davrSurati(
      oyna,
      [seans('2026-09-01')],
      [urinish('2026-09-01T05:00:00Z')],
    );
    expect(s.faolSoniya).toBe(0);
    expect(s.mashq.savollar).toBe(0);
    expect(s.kunlar).toHaveLength(7);
  });
});
