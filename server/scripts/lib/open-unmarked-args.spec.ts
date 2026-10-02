import {
  DEFAULT_FROM,
  parseOpenUnmarkedArgs,
  UsageError,
} from './open-unmarked-args';

describe('parseOpenUnmarkedArgs', () => {
  it('is a dry run from the default day with nothing given', () => {
    expect(parseOpenUnmarkedArgs([])).toEqual({
      apply: false,
      from: DEFAULT_FROM,
      expect: null,
    });
  });

  it('reads --from, --expect and --apply', () => {
    expect(
      parseOpenUnmarkedArgs(['--from=2026-09-15', '--expect=120', '--apply']),
    ).toEqual({ apply: true, from: '2026-09-15', expect: 120 });
  });

  it('lets a dry run rehearse --expect', () => {
    expect(parseOpenUnmarkedArgs(['--expect=0']).expect).toBe(0);
  });

  it.each([
    ['an unknown flag', ['--frm=2026-09-01']],
    ['the space form', ['--from', '2026-09-15']],
    ['a bare --from', ['--from']],
    ['a bare day', ['2026-09-15']],
    ['--apply with a value', ['--apply=1', '--expect=1']],
    ['a flag twice', ['--from=2026-09-01', '--from=2026-09-02']],
  ])('refuses %s', (_label, argv) => {
    expect(() => parseOpenUnmarkedArgs(argv)).toThrow(UsageError);
  });

  it.each(['2026-13-99', '2026-02-30', '2026-9-1', '20260901', ''])(
    'refuses --from=%s as not a real day',
    (day) => {
      expect(() => parseOpenUnmarkedArgs([`--from=${day}`])).toThrow(
        UsageError,
      );
    },
  );

  it.each(['', 'abc', '-1', '1.5', '1e3', '99999999999999999999'])(
    'refuses --expect=%s',
    (n) => {
      expect(() => parseOpenUnmarkedArgs([`--expect=${n}`])).toThrow(
        UsageError,
      );
    },
  );

  it('refuses --apply without --expect', () => {
    expect(() => parseOpenUnmarkedArgs(['--apply'])).toThrow(/--expect/);
    expect(() =>
      parseOpenUnmarkedArgs(['--from=2026-09-01', '--apply']),
    ).toThrow(UsageError);
  });
});
