import {
  exitReasonRequiresComment,
  looksLikeGroupMove,
} from './exit-reason-comment';

describe('exitReasonRequiresComment', () => {
  it('requires a comment for the catch-all reason', () => {
    expect(exitReasonRequiresComment('Boshqa sabab')).toBe(true);
    expect(exitReasonRequiresComment('  boshqa   sabab ')).toBe(true);
    expect(exitReasonRequiresComment('Other')).toBe(true);
  });

  // The whole point of matching exactly rather than by prefix: this reason
  // starts with "Boshqa" but says exactly where the student went.
  it("does not require one for 'Boshqa guruhga ko'chdi'", () => {
    expect(exitReasonRequiresComment("Boshqa guruhga ko'chdi")).toBe(false);
  });

  it('does not require one for the other configured reasons', () => {
    for (const name of [
      'Narx qimmat',
      'Filial almashdi',
      'Kursni tugatdi',
      "O'qishni tashladi",
      "Ustoz ma'qul kelamgan",
      "vaqt-to'g'ri-kelmagan",
    ]) {
      expect(exitReasonRequiresComment(name)).toBe(false);
    }
  });
});

describe('looksLikeGroupMove (ADR-0123)', () => {
  it.each([
    "Boshqa guruhga ko'chdi",
    'Boshqa guruhga kochdi',
    'Boshqa guruhga ko‘chdi',
    'Guruh almashdi',
  ])('%s is a move', (name) => expect(looksLikeGroupMove(name)).toBe(true));

  it.each([
    'Moliyaviy sabablar',
    "O'qishni tashladi",
    'Boshqa sabab',
    'Narx qimmat',
  ])('%s is not a move', (name) =>
    expect(looksLikeGroupMove(name)).toBe(false),
  );
});
