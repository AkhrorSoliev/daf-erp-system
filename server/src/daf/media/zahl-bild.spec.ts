import { zahlBildSvg } from './zahl-bild';

const punkte = (svg: string) => (svg.match(/class="punkt"/g) ?? []).length;
const zellen = (svg: string) => (svg.match(/class="zelle"/g) ?? []).length;

describe('zahlBildSvg — dots in ten-frames, to count', () => {
  it.each([0, 1, 7, 10, 11, 19, 20])('draws exactly %i dots', (n) => {
    expect(punkte(zahlBildSvg(n))).toBe(n);
  });

  it('one frame up to ten, two frames above', () => {
    expect(zellen(zahlBildSvg(10))).toBe(10);
    expect(zellen(zahlBildSvg(11))).toBe(20);
  });

  it('zero is an empty frame, not a blank picture', () => {
    expect(zellen(zahlBildSvg(0))).toBe(10);
  });

  it('carries no text: the digit would give the answer', () => {
    expect(zahlBildSvg(7)).not.toMatch(/<text/);
  });

  it.each([-1, 21, 2.5])('refuses %p', (n) => {
    expect(() => zahlBildSvg(n)).toThrow();
  });

  it('is a square picture', () => {
    expect(zahlBildSvg(3)).toMatch(/viewBox="0 0 1024 1024"/);
  });
});
