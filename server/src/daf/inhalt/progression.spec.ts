import { unknownWordsIn } from './progression';

const known = new Set([
  'basketball',
  'kurs',
  'ist',
  'um',
  'uhr',
  'heute',
  'lukas',
]);
const hilfs = new Set<string>();

describe('unknownWordsIn', () => {
  it('oddiy notanish so`zni qaytaradi', () => {
    expect(unknownWordsIn('Heute ist Tennis.', known, hilfs)).toEqual([
      'tennis',
    ]);
  });

  it('raqam, ikki nuqta, tire va qo`shtirnoq so`z hisoblanmaydi', () => {
    expect(
      unknownWordsIn(
        'Lukas: Heute – um 20 Uhr, 0151 – 2345 „ist“',
        known,
        hilfs,
      ),
    ).toEqual([]);
  });

  it('chiziqchali qo`shma so`zda har bo`lak tanish bo`lishi kerak', () => {
    expect(unknownWordsIn('Basketball-Kurs', known, hilfs)).toEqual([]);
    expect(unknownWordsIn('Yoga-Kurs', known, hilfs)).toEqual(['yoga']);
  });

  it('butun yozuv lug`atda turgan bo`lsa bo`laklarga bo`linmaydi', () => {
    expect(
      unknownWordsIn('Open-Air-Kino', new Set(['open-air-kino']), hilfs),
    ).toEqual([]);
  });
});
