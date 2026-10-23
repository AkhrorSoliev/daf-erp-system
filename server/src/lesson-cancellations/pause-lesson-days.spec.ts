import { lessonEndsInPause, pauseDayRange } from './pause-lesson-days';

const at = (iso: string) => new Date(iso);
// 05.10.2026 12:57 Tashkent
const STARTED = at('2026-10-05T07:57:00.000Z');

describe('pauseDayRange', () => {
  it('an open pause runs through today', () => {
    expect(
      pauseDayRange(
        { startedAt: STARTED, endedAt: null, resumeOn: null },
        '2026-10-23',
      ),
    ).toEqual({ from: '2026-10-05', toExclusive: '2026-10-24' });
  });

  it('stops before the day lessons restart', () => {
    expect(
      pauseDayRange(
        {
          startedAt: STARTED,
          endedAt: at('2026-10-20T00:00:00.000Z'),
          resumeOn: at('2026-10-20T00:00:00.000Z'),
        },
        '2026-10-23',
      ),
    ).toEqual({ from: '2026-10-05', toExclusive: '2026-10-20' });
  });

  it('a restart day still ahead does not extend past today', () => {
    expect(
      pauseDayRange(
        {
          startedAt: STARTED,
          endedAt: null,
          resumeOn: at('2026-11-05T00:00:00.000Z'),
        },
        '2026-10-23',
      ),
    ).toEqual({ from: '2026-10-05', toExclusive: '2026-10-24' });
  });

  it('a pause closed without a restart day ends with its closing day', () => {
    expect(
      pauseDayRange(
        {
          startedAt: STARTED,
          endedAt: at('2026-10-12T05:00:00.000Z'),
          resumeOn: null,
        },
        '2026-10-23',
      ),
    ).toEqual({ from: '2026-10-05', toExclusive: '2026-10-13' });
  });
});

describe('lessonEndsInPause', () => {
  const open = { startedAt: STARTED, endedAt: null, resumeOn: null };

  it('counts the evening lesson of the day the pause began', () => {
    expect(lessonEndsInPause('2026-10-05', '20:30', open)).toBe(true);
  });

  it('does not count a lesson that ended before the pause began', () => {
    expect(lessonEndsInPause('2026-10-05', '11:30', open)).toBe(false);
  });

  it('does not count a lesson after a cancelled group closed', () => {
    const closed = {
      startedAt: STARTED,
      endedAt: at('2026-10-12T05:00:00.000Z'),
      resumeOn: null,
    };
    expect(lessonEndsInPause('2026-10-12', '20:30', closed)).toBe(false);
    expect(lessonEndsInPause('2026-10-12', '09:30', closed)).toBe(true);
  });
});
