import type { DepartureEpisode } from '../../students/shared/departure-episodes';
import {
  NO_REASON,
  buildFact,
  buildStartMember,
  pickEnrollmentAt,
  reasonOf,
  studyMonthsOf,
  teacherIdsAt,
  type CardInput,
  type EnrollmentInput,
  type FactContext,
  type GroupInput,
  type StudentInput,
} from './departure-facts';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function group(over: Partial<GroupInput> = {}): GroupInput {
  return {
    id: 'g1',
    name: 'A1 morning',
    course: { id: 'c1', name: 'German A1' },
    branch: { id: 1, name: 'Central' },
    teacherIds: [10],
    ...over,
  };
}

function enr(over: Partial<EnrollmentInput> = {}): EnrollmentInput {
  return {
    id: 'e1',
    status: 'ACTIVE',
    createdAt: d('2026-09-01'),
    startDate: null,
    statusChangedAt: null,
    statusChangeReason: null,
    departureReason: null,
    stateLog: [],
    group: group(),
    ...over,
  };
}

function card(over: Partial<CardInput> = {}): CardInput {
  return {
    status: 'ACTIVE',
    statusChangeReason: null,
    statusExitReason: null,
    ...over,
  };
}

function student(over: Partial<StudentInput> = {}): StudentInput {
  return {
    id: 7,
    firstName: 'Test',
    lastName: 'Student',
    phone: '+000000001',
    balance: -120000,
    card: card(),
    enrollments: [enr()],
    ...over,
  };
}

const ctx = (over: Partial<FactContext> = {}): FactContext => ({
  teacherChangesByGroup: new Map(),
  teacherName: new Map([
    [10, 'Teacher Ten'],
    [11, 'Teacher Eleven'],
  ]),
  ...over,
});

describe('pickEnrollmentAt', () => {
  it('picks the enrollment that was ACTIVE just before the stop', () => {
    const e = enr({
      status: 'DROPPED',
      statusChangedAt: d('2026-09-10'),
      stateLog: [
        { status: 'ACTIVE', transitionAt: d('2026-09-01') },
        { status: 'DROPPED', transitionAt: d('2026-09-10') },
      ],
    });
    expect(pickEnrollmentAt([e], d('2026-09-10'))).toBe(e);
  });

  it('picks the later created one when two were ACTIVE before the stop', () => {
    const older = enr({ id: 'old', createdAt: d('2026-09-01') });
    const newer = enr({ id: 'new', createdAt: d('2026-09-05') });
    expect(pickEnrollmentAt([newer, older], d('2026-09-20'))?.id).toBe('new');
    expect(pickEnrollmentAt([older, newer], d('2026-09-20'))?.id).toBe('new');
  });

  it('falls back to the latest closed one when none is live at the stop', () => {
    const closedEarly = enr({
      id: 'a',
      status: 'DROPPED',
      statusChangedAt: d('2026-09-05'),
      stateLog: [
        { status: 'ACTIVE', transitionAt: d('2026-09-01') },
        { status: 'DROPPED', transitionAt: d('2026-09-05') },
      ],
    });
    const closedLate = enr({
      id: 'b',
      status: 'DROPPED',
      statusChangedAt: d('2026-09-10'),
      stateLog: [
        { status: 'ACTIVE', transitionAt: d('2026-09-02') },
        { status: 'DROPPED', transitionAt: d('2026-09-10') },
      ],
    });
    // expelled 5 days after he already left the group
    expect(
      pickEnrollmentAt([closedEarly, closedLate], d('2026-09-15'))?.id,
    ).toBe('b');
  });

  it('returns null without enrollments', () => {
    expect(pickEnrollmentAt([], d('2026-09-15'))).toBeNull();
  });
});

describe('teacherIdsAt', () => {
  const change = (iso: string, previousTeacherIds: number[]) => ({
    createdAt: d(iso),
    previousTeacherIds,
  });

  it('uses the previous teachers of the first change after the stop', () => {
    const changes = [
      change('2026-09-05', [1]),
      change('2026-09-20', [2]),
      change('2026-10-01', [3]),
    ];
    expect(teacherIdsAt([9], changes, d('2026-09-10'))).toEqual([2]);
  });

  it('returns today teachers when no change followed the stop', () => {
    expect(teacherIdsAt([9], [], d('2026-09-10'))).toEqual([9]);
    expect(
      teacherIdsAt([9], [change('2026-09-05', [1])], d('2026-09-10')),
    ).toEqual([9]);
  });
});

describe('reasonOf', () => {
  const cardReason = { id: 'r-card', name: 'Card reason' };
  const enrReason = { id: 'r-enr', name: 'Enrollment reason' };

  it('EXPELLED with an EXPELLED card reads the card', () => {
    const r = reasonOf(
      'EXPELLED',
      card({
        status: 'EXPELLED',
        statusExitReason: cardReason,
        statusChangeReason: 'card note',
      }),
      enr({ departureReason: enrReason, statusChangeReason: 'enr note' }),
    );
    expect(r).toEqual({
      id: 'r-card',
      name: 'Card reason',
      comment: 'card note',
    });
  });

  it('EXPELLED with a card in another status reads the enrollment', () => {
    const r = reasonOf(
      'EXPELLED',
      card({ status: 'ACTIVE', statusExitReason: cardReason }),
      enr({ departureReason: enrReason, statusChangeReason: 'enr note' }),
    );
    expect(r).toEqual({
      id: 'r-enr',
      name: 'Enrollment reason',
      comment: 'enr note',
    });
  });

  it('LEFT_GROUP reads the enrollment even if the card is EXPELLED', () => {
    const r = reasonOf(
      'LEFT_GROUP',
      card({ status: 'EXPELLED', statusExitReason: cardReason }),
      enr({ departureReason: enrReason, statusChangeReason: 'enr note' }),
    );
    expect(r.id).toBe('r-enr');
  });

  it('gives NO_REASON when nothing is written', () => {
    expect(reasonOf('EXPELLED', card({ status: 'EXPELLED' }), enr())).toEqual({
      id: null,
      name: NO_REASON,
      comment: null,
    });
    expect(reasonOf('LEFT_GROUP', card(), null)).toEqual({
      id: null,
      name: NO_REASON,
      comment: null,
    });
  });
});

describe('studyMonthsOf', () => {
  it('counts from the earliest startDate, else createdAt', () => {
    const days = 60.88; // two months of 30.44 days
    const departed = new Date(d('2026-09-01').getTime() + days * 86400000);
    expect(
      studyMonthsOf(
        [
          { startDate: d('2026-09-01'), createdAt: d('2026-08-01') },
          { startDate: d('2026-09-15'), createdAt: d('2026-09-10') },
        ],
        departed,
      ),
    ).toBeCloseTo(2, 5);
    // no startDate anywhere: createdAt is used
    expect(
      studyMonthsOf(
        [{ startDate: null, createdAt: d('2026-09-01') }],
        departed,
      ),
    ).toBeCloseTo(2, 5);
  });

  it('returns null when the stop precedes the first enrollment or there is none', () => {
    expect(
      studyMonthsOf(
        [{ startDate: d('2026-09-10'), createdAt: d('2026-09-10') }],
        d('2026-09-01'),
      ),
    ).toBeNull();
    expect(studyMonthsOf([], d('2026-09-01'))).toBeNull();
  });
});

describe('buildFact', () => {
  const ep: DepartureEpisode = {
    studentId: 7,
    startedAt: d('2026-09-20'),
    stopKind: 'LEFT_GROUP',
    state: 'confirmed',
    confirmedAt: d('2026-10-11'),
    returnedAt: d('2026-10-15'),
  };

  it('assembles the fact with teachers at the stop moment', () => {
    const s = student({
      enrollments: [
        enr({
          departureReason: { id: 'r1', name: 'Moved away' },
          statusChangeReason: 'moving',
        }),
      ],
    });
    const fact = buildFact(
      ep,
      s,
      ctx({
        teacherChangesByGroup: new Map([
          [
            'g1',
            [{ createdAt: d('2026-09-25'), previousTeacherIds: [10, 11] }],
          ],
        ]),
      }),
    );
    expect(fact).toMatchObject({
      key: `7:${d('2026-09-20').getTime()}`,
      studentId: 7,
      fullName: 'Test Student',
      phone: '+000000001',
      balance: -120000,
      startedAt: ep.startedAt,
      stopKind: 'LEFT_GROUP',
      state: 'confirmed',
      returnedAt: ep.returnedAt,
      reason: { id: 'r1', name: 'Moved away' },
      comment: 'moving',
      group: { id: 'g1', name: 'A1 morning' },
      course: { id: 'c1', name: 'German A1' },
      branch: { id: 1, name: 'Central' },
      teachers: [
        { id: 10, fullName: 'Teacher Ten' },
        { id: 11, fullName: 'Teacher Eleven' },
      ],
    });
    expect(fact.studyMonths).toBeCloseTo(19 / 30.44, 5);
  });

  it('leaves group, course, branch null and teachers empty without a group', () => {
    const s = student({ enrollments: [enr({ group: null })] });
    const fact = buildFact(ep, s, ctx());
    expect(fact.group).toBeNull();
    expect(fact.course).toBeNull();
    expect(fact.branch).toBeNull();
    expect(fact.teachers).toEqual([]);
  });
});

describe('buildStartMember', () => {
  it('places the student in the given enrollment group with teachers at that moment', () => {
    const s = student({
      enrollments: [
        enr({ id: 'e1', group: group({ id: 'g1' }) }),
        enr({
          id: 'e2',
          group: group({ id: 'g2', name: 'B1 evening', teacherIds: [11] }),
        }),
      ],
    });
    expect(buildStartMember('e2', s, d('2026-09-01'), ctx())).toEqual({
      studentId: 7,
      group: { id: 'g2', name: 'B1 evening' },
      course: { id: 'c1', name: 'German A1' },
      branch: { id: 1, name: 'Central' },
      teachers: [{ id: 11, fullName: 'Teacher Eleven' }],
    });
  });
});
