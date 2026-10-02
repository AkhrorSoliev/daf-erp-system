import { eigeneSchluessel } from './eigener-abschnitt';

const wort = (id: number, sectionCode: string) => ({
  id,
  de: `w${id}`,
  uz: `u${id}`,
  artikel: null,
  anzeige: null,
  sectionCode,
  audioKey: null,
});

describe('eigeneSchluessel', () => {
  const material = {
    coreWords: [wort(1, 'u01-s5'), wort(2, 'u01-s1')],
    sentences: [
      { id: 11, de: 'a', uz: 'a', sectionCode: 'u01-s5', akzeptiert: [] },
      { id: 12, de: 'b', uz: 'b', sectionCode: 'u01-s2', akzeptiert: [] },
    ],
    phrases: [
      { id: 21, funktionUz: 'x', de: 'x', uz: 'x', sectionCode: 'u01-s5' },
    ],
    dialoge: [
      {
        id: 31,
        titelDe: 'd',
        sectionCode: 'u01-s5',
        audioKey: null,
        zeilen: [{ id: 301, sprecher: 'A', de: 'a', uz: 'a' }],
        fragen: [
          { id: 401, frageDe: 'q', frageUz: 'q', richtig: 'r', falsch: [] },
        ],
      },
    ],
  };

  it('collects every kind of material of the section, and nothing else', () => {
    expect([...eigeneSchluessel('u01-s5', material)].sort()).toEqual(
      [
        'WORT:1',
        'SATZ:11',
        'PHRASE:21',
        'DIALOGZEILE:301',
        'HOERFRAGE:401',
      ].sort(),
    );
  });

  it('is empty without a section (the unit test)', () => {
    expect(eigeneSchluessel(undefined, material).size).toBe(0);
  });
});
