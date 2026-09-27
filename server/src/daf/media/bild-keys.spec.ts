import { bildSchluesselFuer, neuerBildSchluessel } from './bild-keys';

describe('neuerBildSchluessel', () => {
  it('is random under daf/bild and never repeats', () => {
    const a = neuerBildSchluessel();
    const b = neuerBildSchluessel();
    expect(a).toMatch(/^daf\/bild\/[0-9a-f]{32}\.jpg$/);
    expect(a).not.toBe(b);
  });
});

describe('bildSchluesselFuer', () => {
  it('reads the manifest and answers null for a word without a picture', () => {
    const m = { 'u03-s4-fahrrad': 'daf/bild/abc.jpg' };
    expect(bildSchluesselFuer(m, 'u03-s4-fahrrad')).toBe('daf/bild/abc.jpg');
    expect(bildSchluesselFuer(m, 'u03-s4-bus')).toBeNull();
  });
});
