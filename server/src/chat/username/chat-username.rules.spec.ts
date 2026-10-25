import { normalizeUsername, usernameProblem } from './chat-username.rules';

describe('username rules', () => {
  it('normalises case, spaces and one leading @', () => {
    expect(normalizeUsername('  @Asror_01 ')).toBe('asror_01');
  });

  it.each(['asror_01', 'a1234', 'a'.padEnd(32, 'b')])('accepts %s', (u) => {
    expect(usernameProblem(u)).toBeNull();
  });

  it.each([
    ['abcd', 'short'],
    ['a'.padEnd(33, 'b'), 'long'],
    ['1abcde', 'starts with a digit'],
    ['_abcde', 'starts with underscore'],
    ['ab cde', 'space'],
    ['abcdé1', 'non-latin'],
    ['ab-cde', 'dash'],
  ])('refuses %s (%s)', (u) => {
    expect(usernameProblem(u)).toBe(
      "Username 5–32 belgi bo'lsin: lotin harf, raqam va _, harf bilan boshlansin",
    );
  });
});
