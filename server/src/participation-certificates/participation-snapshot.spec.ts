import { buildSnapshot } from './participation-snapshot';
import type { LevelFacts, StudentFacts } from './participation-types';

const student: StudentFacts['student'] = {
  firstName: 'Madina',
  lastName: 'Karimova',
  dateOfBirth: '2004-03-14',
};

const facts: LevelFacts = {
  level: 'A1',
  groupNames: ['A1-17'],
  courseName: 'Deutsch A1',
  lessonMinutes: 90,
  from: '2026-07-07',
  to: '2026-10-15',
  attendance: { attended: 21, late: 2, absent: 2, counted: 23, percent: 91 },
  app: { applies: true, done: 80, open: 80, percent: 100 },
  unitTests: { passed: 5, total: 5 },
  mock: { score: 72, maxScore: 100, date: '2026-10-07' },
};

describe('buildSnapshot', () => {
  it('freezes the facts, the thresholds and the exemption flag', () => {
    const snapshot = buildSnapshot(
      student,
      facts,
      { attendance: 80, app: 100 },
      false,
    );
    expect(snapshot).toEqual({
      version: 1,
      student,
      level: 'A1',
      courseName: 'Deutsch A1',
      groupNames: ['A1-17'],
      lessonMinutes: 90,
      from: '2026-07-07',
      to: '2026-10-15',
      attendance: facts.attendance,
      app: facts.app,
      unitTests: { passed: 5, total: 5 },
      mock: { score: 72, maxScore: 100, date: '2026-10-07' },
      thresholds: { attendance: 80, app: 100 },
      exempt: false,
    });
  });

  it('does not alias the live facts: changing them later leaves the snapshot alone', () => {
    const snapshot = buildSnapshot(
      student,
      facts,
      { attendance: 80, app: null },
      true,
    );
    facts.attendance.attended = 0;
    expect(snapshot.attendance.attended).toBe(21);
    expect(snapshot.exempt).toBe(true);
    facts.attendance.attended = 21;
  });
});
