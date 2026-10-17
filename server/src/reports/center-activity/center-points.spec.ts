import {
  enrolledOn,
  groupStatusOn,
  isGroupOpen,
  lessonSlots,
  normalizeWorkWindow,
  pointOn,
  roomExistsOn,
  toMinutes,
} from './center-points';
import type { GroupFact, RoomFact } from './center-activity.types';

const d = (s: string) => new Date(s);
const W = { start: '08:00', end: '22:30' };

const group = (over: Partial<GroupFact> = {}): GroupFact => ({
  id: 'g1',
  name: 'A1-04',
  roomId: 'r1',
  branchId: 1,
  createdAt: d('2026-05-01T00:00:00Z'),
  startDate: null,
  endDate: null,
  deletedAt: null,
  scheduleNow: {
    exactDays: ['monday'],
    start: '10:00',
    end: '11:30',
    courseId: 'c1',
  },
  scheduleHistory: [],
  statusLog: [],
  enrollments: [],
  ...over,
});

describe('pointOn', () => {
  const history = [
    {
      validFrom: d('2026-05-01T00:00:00Z'),
      validTo: d('2026-07-01T00:00:00Z'),
      value: 10,
    },
    { validFrom: d('2026-07-01T00:00:00Z'), validTo: null, value: 14 },
  ];
  it('reads the version valid at the instant, else the fallback', () => {
    expect(pointOn(history, d('2026-06-15T00:00:00Z'), 99)).toBe(10);
    expect(pointOn(history, d('2026-07-01T00:00:00Z'), 99)).toBe(14);
    expect(pointOn(history, d('2026-04-01T00:00:00Z'), 99)).toBe(99);
    expect(pointOn([], d('2026-06-15T00:00:00Z'), 7)).toBe(7);
  });
});

describe('normalizeWorkWindow', () => {
  it('keeps a valid window and falls back otherwise', () => {
    expect(normalizeWorkWindow('08:00', '22:30')).toEqual({
      start: '08:00',
      end: '22:30',
    });
    expect(normalizeWorkWindow(null, null)).toEqual({
      start: '09:00',
      end: '21:00',
    });
    expect(normalizeWorkWindow('21:00', '09:00')).toEqual({
      start: '09:00',
      end: '21:00',
    });
    expect(normalizeWorkWindow('9', '21:00')).toEqual({
      start: '09:00',
      end: '21:00',
    });
  });
});

describe('lessonSlots', () => {
  it('returns half-hour slot indexes', () => {
    expect(lessonSlots('10:00', '11:30', W)).toEqual([20, 21, 22]);
  });
  it('clips to the working window', () => {
    expect(lessonSlots('07:00', '09:00', W)).toEqual([16, 17]);
    expect(lessonSlots('22:00', '23:30', W)).toEqual([44]);
  });
  it('returns nothing for a missing or reversed time', () => {
    expect(lessonSlots(null, '11:00', W)).toEqual([]);
    expect(lessonSlots('12:00', '11:00', W)).toEqual([]);
    expect(lessonSlots('25:00', '26:00', W)).toEqual([]);
  });
  it('toMinutes', () => {
    expect(toMinutes('08:30')).toBe(510);
  });
});

describe('groupStatusOn', () => {
  it('reads StatusHistory, and ACTIVE from creation when there is none', () => {
    const g = group({
      statusLog: [
        { status: 'CANCELLED', at: d('2026-08-10T00:00:00Z') },
        { status: 'ACTIVE', at: d('2026-08-20T00:00:00Z') },
      ],
    });
    expect(groupStatusOn(g, d('2026-08-01T00:00:00Z'))).toBe('ACTIVE');
    expect(groupStatusOn(g, d('2026-08-15T00:00:00Z'))).toBe('CANCELLED');
    expect(groupStatusOn(g, d('2026-09-01T00:00:00Z'))).toBe('ACTIVE');
    expect(groupStatusOn(group(), d('2026-09-01T00:00:00Z'))).toBe('ACTIVE');
  });
});

describe('isGroupOpen', () => {
  it('is closed before it was created or started', () => {
    expect(isGroupOpen(group(), d('2026-04-30T00:00:00Z'))).toBe(false);
    expect(
      isGroupOpen(
        group({ startDate: d('2026-06-01T00:00:00Z') }),
        d('2026-05-20T00:00:00Z'),
      ),
    ).toBe(false);
    expect(
      isGroupOpen(
        group({ startDate: d('2026-06-01T00:00:00Z') }),
        d('2026-06-02T00:00:00Z'),
      ),
    ).toBe(true);
  });
  it('a group deleted later is still open before the deletion', () => {
    const g = group({ deletedAt: d('2026-09-10T00:00:00Z') });
    expect(isGroupOpen(g, d('2026-08-31T18:59:59Z'))).toBe(true);
    expect(isGroupOpen(g, d('2026-09-30T18:59:59Z'))).toBe(false);
  });
  it('is closed after its endDate and while not ACTIVE or FORMING', () => {
    expect(
      isGroupOpen(
        group({ endDate: d('2026-07-01T00:00:00Z') }),
        d('2026-07-02T00:00:00Z'),
      ),
    ).toBe(false);
    const paused = group({
      statusLog: [{ status: 'PAUSED', at: d('2026-07-01T00:00:00Z') }],
    });
    expect(isGroupOpen(paused, d('2026-07-02T00:00:00Z'))).toBe(false);
    const forming = group({
      statusLog: [{ status: 'FORMING', at: d('2026-05-01T00:00:00Z') }],
    });
    expect(isGroupOpen(forming, d('2026-07-02T00:00:00Z'))).toBe(true);
  });
});

describe('roomExistsOn', () => {
  const room = (over: Partial<RoomFact> = {}): RoomFact => ({
    id: 'r1',
    name: '1-xona',
    branchId: 1,
    branchName: "Farg'ona",
    createdAt: d('2026-05-01T00:00:00Z'),
    deletedAt: null,
    status: 'ACTIVE',
    capacityNow: 16,
    capacityHistory: [],
    window: W,
    ...over,
  });
  it('existence by creation and deletion; the current month also needs ACTIVE', () => {
    expect(roomExistsOn(room(), d('2026-04-01T00:00:00Z'), false)).toBe(false);
    expect(
      roomExistsOn(
        room({ deletedAt: d('2026-07-01T00:00:00Z') }),
        d('2026-08-01T00:00:00Z'),
        false,
      ),
    ).toBe(false);
    expect(
      roomExistsOn(
        room({ status: 'INACTIVE' }),
        d('2026-08-01T00:00:00Z'),
        false,
      ),
    ).toBe(true);
    expect(
      roomExistsOn(
        room({ status: 'INACTIVE' }),
        d('2026-08-01T00:00:00Z'),
        true,
      ),
    ).toBe(false);
  });
});

describe('enrolledOn', () => {
  it('counts enrollments ACTIVE at the instant (log, then own columns)', () => {
    const g = group({
      enrollments: [
        {
          createdAt: d('2026-05-01T00:00:00Z'),
          statusChangedAt: null,
          status: 'ACTIVE',
          log: [],
        },
        {
          createdAt: d('2026-05-01T00:00:00Z'),
          statusChangedAt: d('2026-08-10T00:00:00Z'),
          status: 'DROPPED',
          log: [
            { status: 'ACTIVE', transitionAt: d('2026-05-01T00:00:00Z') },
            { status: 'DROPPED', transitionAt: d('2026-08-10T00:00:00Z') },
          ],
        },
      ],
    });
    expect(enrolledOn(g, d('2026-08-01T00:00:00Z'))).toBe(2);
    expect(enrolledOn(g, d('2026-09-01T00:00:00Z'))).toBe(1);
  });
});
