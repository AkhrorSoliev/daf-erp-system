import { zahlBildSvg } from './zahl-bild';

const texte = (svg: string) =>
  [...svg.matchAll(/<text[^>]*font-size="(\d+)"[^>]*>([^<]*)<\/text>/g)].map(
    (m) => ({ groesse: Number(m[1]), inhalt: m[2] }),
  );

describe('zahlBildSvg — one numeral on a house-number plate', () => {
  it.each([0, 7, 13, 35, 53, 99])('shows exactly the numeral %i', (n) => {
    expect(texte(zahlBildSvg(n))).toEqual([
      { groesse: 440, inhalt: String(n) },
    ]);
  });

  it('keeps one size for one and two digits, so size is no clue', () => {
    expect(texte(zahlBildSvg(7))[0].groesse).toBe(
      texte(zahlBildSvg(70))[0].groesse,
    );
  });

  it('fits 100 with a smaller size', () => {
    expect(texte(zahlBildSvg(100))).toEqual([{ groesse: 300, inhalt: '100' }]);
  });

  it('draws the same plate for every number: only the numeral differs', () => {
    const ohneZahl = (svg: string) => svg.replace(/<text[\s\S]*<\/text>/, '');
    expect(ohneZahl(zahlBildSvg(3))).toBe(ohneZahl(zahlBildSvg(48)));
  });

  it.each([-1, 101, 3.5])('refuses %p', (n) => {
    expect(() => zahlBildSvg(n)).toThrow();
  });

  it('is a square picture', () => {
    expect(zahlBildSvg(3)).toMatch(/viewBox="0 0 1024 1024"/);
  });
});
