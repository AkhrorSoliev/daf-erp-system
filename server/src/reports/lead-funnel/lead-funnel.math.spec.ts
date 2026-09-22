import {
  countStages,
  personsAtStage,
  toPersons,
  type CohortLead,
} from './lead-funnel.math';

const lead = (over: Partial<CohortLead>): CohortLead => ({
  id: 'l1',
  studentId: null,
  board: true,
  firstName: 'Ali',
  lastName: 'Valiyev',
  phone: '901112233',
  source: 'Instagram',
  createdAt: new Date('2026-09-01T10:00:00Z'),
  ...over,
});

describe('toPersons', () => {
  it("aylanmagan lid — o'zi bitta odam", () => {
    const persons = toPersons([lead({ id: 'a' }), lead({ id: 'b' })]);
    expect(persons.map((p) => p.key)).toEqual(['l:a', 'l:b']);
  });

  it("bir o'quvchiga bog'langan ikki lid — bitta odam", () => {
    const persons = toPersons([
      lead({ id: 'a', studentId: 11, createdAt: new Date('2026-09-05') }),
      lead({ id: 'b', studentId: 11, createdAt: new Date('2026-09-02') }),
    ]);
    expect(persons).toHaveLength(1);
    expect(persons[0].key).toBe('s:11');
    // Odam birinchi kelgan vaqti bilan sanaladi.
    expect(persons[0].createdAt).toEqual(new Date('2026-09-02'));
  });

  it('ism, telefon va manba birinchi liddan olinadi', () => {
    const [p] = toPersons([
      lead({
        id: 'a',
        studentId: 11,
        firstName: 'Keyin',
        phone: '1',
        source: 'Telegram',
        createdAt: new Date('2026-09-05'),
      }),
      lead({
        id: 'b',
        studentId: 11,
        firstName: 'Avval',
        phone: '2',
        source: 'Instagram',
        createdAt: new Date('2026-09-02'),
      }),
    ]);
    expect(p).toMatchObject({
      name: 'Avval Valiyev',
      phone: '2',
      source: 'Instagram',
    });
  });

  it("bog'langan lidlardan biri doskadan bo'lsa, odam doskadan kelgan", () => {
    const [p] = toPersons([
      lead({ id: 'a', studentId: 11, board: false }),
      lead({ id: 'b', studentId: 11, board: true }),
    ]);
    expect(p.board).toBe(true);
  });
});

describe('countStages', () => {
  const persons = toPersons([
    lead({ id: 'a' }), // faqat lid
    lead({ id: 'b', studentId: 1, board: false }), // guruhga yozilmagan o'quvchi
    lead({ id: 'c', studentId: 2 }), // yozilgan
    lead({ id: 'd', studentId: 3 }), // yozilgan, kelgan
    lead({ id: 'e', studentId: 4 }), // yozilgan, kelgan, to'lagan
  ]);
  const sets = {
    enrolled: new Set([2, 3, 4]),
    attended: new Set([3, 4]),
    paid: new Set([4]),
  };

  it('har bosqichni odam soni bilan sanaydi', () => {
    expect(countStages(persons, sets)).toEqual({
      stages: { lead: 5, enrolled: 3, attended: 2, paid: 1 },
      leadSplit: { board: 4, direct: 1 },
    });
  });

  // Voronka qat'iy ichma-ich: bosqich oldingisining qismi. Oldindan to'lab hali
  // darsga kelmagan odam «To'lov qildi» da emas, «Guruhga yozildi» da turadi —
  // aks holda blok torayish o'rniga kengayishi mumkin edi.
  it("darsga kelmay to'lagan odam to'lov bosqichiga o'tmaydi", () => {
    const r = countStages(persons, {
      enrolled: new Set([2, 3, 4]),
      attended: new Set([4]),
      paid: new Set([3, 4]),
    });
    expect(r.stages.paid).toBe(1);
    expect(r.stages.paid).toBeLessThanOrEqual(r.stages.attended);
  });

  it("guruhga yozilmagan o'quvchining davomati va to'lovi sanalmaydi", () => {
    const r = countStages(persons, {
      enrolled: new Set<number>(),
      attended: new Set([1, 2, 3, 4]),
      paid: new Set([1, 2, 3, 4]),
    });
    expect(r.stages).toEqual({ lead: 5, enrolled: 0, attended: 0, paid: 0 });
  });
});

describe('personsAtStage', () => {
  const persons = toPersons([
    lead({ id: 'a' }),
    lead({ id: 'c', studentId: 2 }),
    lead({ id: 'd', studentId: 3 }),
    lead({ id: 'e', studentId: 4 }),
  ]);
  const sets = {
    enrolled: new Set([2, 3, 4]),
    attended: new Set([3, 4]),
    paid: new Set([4]),
  };

  it("'all' — shu bosqichga yetganlarning hammasi", () => {
    const keys = personsAtStage(persons, sets, 'attended', 'all').map(
      (p) => p.key,
    );
    expect(keys.sort()).toEqual(['s:3', 's:4']);
  });

  it("'stuck' — shu bosqichda to'xtab, keyingisiga o'tmaganlar", () => {
    const keys = personsAtStage(persons, sets, 'attended', 'stuck').map(
      (p) => p.key,
    );
    // #4 to'lagan, shuning uchun «darsga kelib to'lamaganlar» ro'yxatida yo'q.
    expect(keys).toEqual(['s:3']);
  });

  it("'stuck' lid bosqichida — o'quvchiga ham aylanmaganlar va yozilmaganlar", () => {
    const keys = personsAtStage(persons, sets, 'lead', 'stuck').map(
      (p) => p.key,
    );
    expect(keys).toEqual(['l:a']);
  });

  it("oxirgi bosqichda 'stuck' ma'nosiz — hammasi qaytadi", () => {
    expect(
      personsAtStage(persons, sets, 'paid', 'stuck').map((p) => p.key),
    ).toEqual(['s:4']);
  });

  it('yangisi birinchi tartiblanadi', () => {
    const ordered = personsAtStage(
      toPersons([
        lead({ id: 'old', createdAt: new Date('2026-09-01') }),
        lead({ id: 'new', createdAt: new Date('2026-09-09') }),
      ]),
      sets,
      'lead',
      'all',
    );
    expect(ordered.map((p) => p.key)).toEqual(['l:new', 'l:old']);
  });
});
