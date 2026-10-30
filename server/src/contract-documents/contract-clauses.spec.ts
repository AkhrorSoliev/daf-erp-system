import { NotFoundException } from '@nestjs/common';
import { BODY_SECTIONS } from './pdf/contract-template-v1';
import { clausesFromTemplate } from './contract-clauses';

const fullText = (no: string) =>
  BODY_SECTIONS.flatMap((s) => s.items).find((i) => i.startsWith(`${no}. `))!;

describe('clausesFromTemplate', () => {
  it('returns the clause text of the live template, without the number', () => {
    const [c32, c63] = clausesFromTemplate(['3.2', '6.3']);
    expect(c32.no).toBe('3.2');
    expect(fullText('3.2')).toBe(`3.2. ${c32.text}`);
    expect(c63.no).toBe('6.3');
    expect(c63.text).toContain('14 kalendar kun');
  });

  it('keeps the order asked for and drops duplicates', () => {
    const out = clausesFromTemplate(['6.2', '3.5', '6.2']);
    expect(out.map((c) => c.no)).toEqual(['6.2', '3.5']);
  });

  it('refuses a clause the template does not have', () => {
    expect(() => clausesFromTemplate(['9.99'])).toThrow(NotFoundException);
  });

  it('does not match 3.2 for 3.20', () => {
    expect(() => clausesFromTemplate(['3.20'])).toThrow(NotFoundException);
  });
});
