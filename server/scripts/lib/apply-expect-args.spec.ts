import { parseApplyExpectArgs, UsageError } from './apply-expect-args';

const parse = (argv: string[]) => parseApplyExpectArgs(argv, 'Usage: x');

describe('parseApplyExpectArgs', () => {
  it('defaults to a dry run', () =>
    expect(parse([])).toEqual({ apply: false, expect: null }));
  it('reads --expect alone', () =>
    expect(parse(['--expect=3'])).toEqual({ apply: false, expect: 3 }));
  it('reads --apply with --expect', () =>
    expect(parse(['--apply', '--expect=3'])).toEqual({
      apply: true,
      expect: 3,
    }));
  it('refuses --apply without --expect', () =>
    expect(() => parse(['--apply'])).toThrow(UsageError));
  it.each([['--expect=x'], ['--foo'], ['--expect='], ['--expect=-1']])(
    'refuses %s',
    (arg) => expect(() => parse([arg])).toThrow(UsageError),
  );
  it('refuses a repeated flag', () => {
    expect(() => parse(['--apply', '--apply'])).toThrow(UsageError);
    expect(() => parse(['--expect=1', '--expect=1'])).toThrow(UsageError);
  });
});
