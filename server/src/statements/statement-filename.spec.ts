import { statementFilename } from './statement.service';

const model = (firstName: string, lastName: string, id = 10001) =>
  ({
    asOf: '2026-09-26',
    student: { id, firstName, lastName },
  }) as never;

describe('statementFilename', () => {
  it('is surname, first initial, id and the day', () => {
    expect(statementFilename(model('Ali', 'Valiyev'))).toBe(
      'Valiyev-A-10001-26-09-2026.pdf',
    );
  });

  it("drops the Uzbek apostrophes, which a file name can't carry", () => {
    expect(statementFilename(model("O'ktam", "G'aniyev"))).toBe(
      'Ganiyev-O-10001-26-09-2026.pdf',
    );
    expect(statementFilename(model('Oʻktam', 'Gʻaniyev'))).toBe(
      'Ganiyev-O-10001-26-09-2026.pdf',
    );
  });

  it('joins a two-word surname with a hyphen', () => {
    expect(statementFilename(model('Ali', 'Valiyev Karimov'))).toBe(
      'Valiyev-Karimov-A-10001-26-09-2026.pdf',
    );
  });

  it('keeps the id and the day when the name has nothing usable', () => {
    expect(statementFilename(model('Али', 'Валиев'))).toBe(
      '10001-26-09-2026.pdf',
    );
  });
});
