import {
  countBySource,
  countByBranch,
  countStages,
  FUNNEL_START_DATE,
  matchesSource,
  personsAtStage,
  previousPeriod,
  stageDepth,
  toPersons,
  type CohortLead,
  type FunnelPerson,
  type StageSets,
} from './lead-funnel.math';

const lead = (over: Partial<CohortLead>): CohortLead => ({
  id: 'l1',
  studentId: null,
  board: true,
  firstName: 'Ali',
  lastName: 'Valiyev',
  phone: '901112233',
  source: 'Instagram',
  sourceId: null,
  branchId: null,
  branchName: null,
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

function person(over: Partial<FunnelPerson>): FunnelPerson {
  return {
    key: over.key ?? `l:${over.leadId ?? 'x'}`,
    leadId: over.leadId ?? 'x',
    studentId: over.studentId ?? null,
    board: over.board ?? true,
    name: over.name ?? 'Test',
    phone: over.phone ?? '900000000',
    source: over.source ?? null,
    sourceId: over.sourceId ?? null,
    branchId: over.branchId ?? null,
    branchName: over.branchName ?? null,
    createdAt: over.createdAt ?? new Date('2026-09-12T05:00:00Z'),
  };
}

const SETS: StageSets = {
  enrolled: new Set([1, 2, 3]),
  attended: new Set([1, 2]),
  paid: new Set([1]),
};

describe('toPersons — manba va filial', () => {
  const base: CohortLead = {
    id: 'a',
    studentId: 5,
    board: true,
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901',
    source: 'Instagram',
    sourceId: 'src-ig',
    branchId: null,
    branchName: null,
    createdAt: new Date('2026-09-12T05:00:00Z'),
  };

  it('manba id va filial birinchi liddan olinadi', () => {
    const [p] = toPersons([{ ...base, branchId: 1, branchName: "Farg'ona" }]);
    expect(p.sourceId).toBe('src-ig');
    expect(p.branchId).toBe(1);
    expect(p.branchName).toBe("Farg'ona");
  });

  it("birinchi lidda filial bo'lmasa, keyingi liddan to'ldiriladi", () => {
    const later: CohortLead = {
      ...base,
      id: 'b',
      branchId: 2,
      branchName: 'Namangan',
      createdAt: new Date('2026-09-13T05:00:00Z'),
    };
    const [p] = toPersons([base, later]);
    expect(p.leadId).toBe('a');
    expect(p.branchId).toBe(2);
    expect(p.branchName).toBe('Namangan');
  });
});

describe('stageDepth', () => {
  it("o'quvchisiz odam 0, to'lagan 3", () => {
    expect(stageDepth(person({ studentId: null }), SETS)).toBe(0);
    expect(stageDepth(person({ studentId: 3 }), SETS)).toBe(1);
    expect(stageDepth(person({ studentId: 2 }), SETS)).toBe(2);
    expect(stageDepth(person({ studentId: 1 }), SETS)).toBe(3);
  });
});

describe('countBySource', () => {
  const persons = [
    person({
      leadId: 'a',
      studentId: 1,
      sourceId: 'tg',
      source: 'Telegram bot',
    }),
    person({
      leadId: 'b',
      studentId: 2,
      sourceId: 'tg',
      source: 'Telegram bot',
    }),
    person({
      leadId: 'c',
      studentId: null,
      sourceId: 'ig',
      source: 'Instagram',
    }),
    person({ leadId: 'd', studentId: 3, sourceId: 'ig', source: 'Instagram' }),
    person({ leadId: 'e', studentId: 9, sourceId: 'ig', source: 'Instagram' }),
    person({ leadId: 'f', studentId: null, sourceId: null, source: null }),
  ];

  it("manba bo'yicha ichma-ich bosqichlar, lid soni bo'yicha kamayib", () => {
    expect(countBySource(persons, SETS)).toEqual([
      {
        id: 'ig',
        name: 'Instagram',
        lead: 3,
        enrolled: 1,
        attended: 0,
        paid: 0,
      },
      {
        id: 'tg',
        name: 'Telegram bot',
        lead: 2,
        enrolled: 2,
        attended: 2,
        paid: 1,
      },
      { id: null, name: null, lead: 1, enrolled: 0, attended: 0, paid: 0 },
    ]);
  });

  it("teng lid sonida nom bo'yicha", () => {
    const rows = countBySource(
      [
        person({ leadId: 'x', sourceId: 'b', source: 'Tanishlar' }),
        person({ leadId: 'y', sourceId: 'a', source: 'Instagram' }),
      ],
      SETS,
    );
    expect(rows.map((r) => r.name)).toEqual(['Instagram', 'Tanishlar']);
  });
});

describe('countByBranch', () => {
  it("filial bo'yicha lid va to'lov; filialsiz alohida", () => {
    const persons = [
      person({
        leadId: 'a',
        studentId: 1,
        branchId: 1,
        branchName: "Farg'ona",
      }),
      person({
        leadId: 'b',
        studentId: 2,
        branchId: 1,
        branchName: "Farg'ona",
      }),
      person({
        leadId: 'c',
        studentId: null,
        branchId: 2,
        branchName: 'Namangan',
      }),
      person({ leadId: 'd', studentId: null }),
    ];
    expect(countByBranch(persons, SETS)).toEqual([
      { id: 1, name: "Farg'ona", lead: 2, paid: 1 },
      { id: 2, name: 'Namangan', lead: 1, paid: 0 },
      { id: null, name: null, lead: 1, paid: 0 },
    ]);
  });
});

describe('previousPeriod', () => {
  it('shu uzunlikdagi bevosita oldingi oraliq', () => {
    expect(
      previousPeriod({ startDate: '2026-10-01', endDate: '2026-10-31' }),
    ).toEqual({ startDate: '2026-09-10', endDate: '2026-09-30' });
  });

  it("to'liq chegaradan oldin bo'lsa null", () => {
    expect(
      previousPeriod({ startDate: FUNNEL_START_DATE, endDate: '2026-09-30' }),
    ).toBeNull();
  });

  it('bir kunlik davr', () => {
    expect(
      previousPeriod({ startDate: '2026-09-12', endDate: '2026-09-12' }),
    ).toEqual({ startDate: '2026-09-11', endDate: '2026-09-11' });
  });

  it('yil chegarasi orqali', () => {
    expect(
      previousPeriod({ startDate: '2027-01-01', endDate: '2027-01-31' }),
    ).toEqual({ startDate: '2026-12-01', endDate: '2026-12-31' });
  });
});

describe('matchesSource', () => {
  it("filtr yo'q — hammasi", () => {
    expect(matchesSource(person({ sourceId: 'ig' }), undefined)).toBe(true);
  });
  it("'none' — manbasizlar", () => {
    expect(matchesSource(person({ sourceId: null }), 'none')).toBe(true);
    expect(matchesSource(person({ sourceId: 'ig' }), 'none')).toBe(false);
  });
  it("id bo'yicha", () => {
    expect(matchesSource(person({ sourceId: 'ig' }), 'ig')).toBe(true);
    expect(matchesSource(person({ sourceId: 'tg' }), 'ig')).toBe(false);
  });
});
