import { exitReasonRequiresComment } from './exit-reason-comment';

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
