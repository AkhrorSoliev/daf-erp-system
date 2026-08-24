import { describeValue } from './describe-value';

describe('describeValue', () => {
  it('passes primitives through unchanged', () => {
    expect(describeValue('salom')).toBe('salom');
    expect(describeValue(42)).toBe('42');
    expect(describeValue(true)).toBe('true');
    expect(describeValue(10n)).toBe('10');
  });

  it('names null and undefined instead of printing nothing', () => {
    expect(describeValue(null)).toBe('null');
    expect(describeValue(undefined)).toBe('undefined');
  });

  it('gives an object its contents, not [object Object]', () => {
    expect(describeValue({ error: 'invalid_grant' })).toBe(
      '{"error":"invalid_grant"}',
    );
    expect(describeValue({ a: 1 })).not.toContain('[object Object]');
  });

  it('unwraps an Error to its message — the part worth logging', () => {
    expect(describeValue(new Error('bordi-keldi'))).toBe('bordi-keldi');
  });

  it('survives a circular object rather than throwing inside a catch block', () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    expect(() => describeValue(circular)).not.toThrow();
    expect(describeValue(circular)).toContain('bo');
  });

  it('bounds the output — a log line is not a data store', () => {
    expect(describeValue('x'.repeat(2000))).toHaveLength(501); // 500 + ellipsis
    expect(describeValue({ big: 'y'.repeat(2000) })).toHaveLength(501);
  });

  it('handles the shapes that reach it from a catch block', () => {
    expect(describeValue([1, 2, 3])).toBe('[1,2,3]');
    expect(describeValue(() => undefined)).toContain('function');
  });
});
