import { bevorzugteFormate } from './kind-formate';
import type { FrageFormat } from './frage.types';

describe('bevorzugteFormate', () => {
  it('Tanishuv tanib olishga suyanadi', () => {
    expect(bevorzugteFormate('SECTION_A')).toEqual(
      expect.arrayContaining(['WORT_UZ', 'PAAR', 'ZUORDNEN']),
    );
  });

  it('Ishlatish ishlab chiqarishga suyanadi', () => {
    expect(bevorzugteFormate('SECTION_B')).toEqual(
      expect.arrayContaining(['UZ_WORT', 'ARTIKEL', 'LUECKE', 'SATZ_BAUEN']),
    );
  });

  it("O'tish sinovida moyillik YO'Q — ataylab aralash", () => {
    expect(bevorzugteFormate('BRIDGE')).toEqual([]);
  });

  it('Yakuniy sinov vaziyatga suyanadi', () => {
    expect(bevorzugteFormate('UNIT_TEST')).toEqual(
      expect.arrayContaining(['REAKTION', 'ZUORDNEN', 'DIALOG_LUECKE']),
    );
  });

  it('har turning formatlari HAQIQATDA mavjud formatlardan', () => {
    // Xaritaga yozuv xatosi bilan mavjud bo'lmagan format tushsa, u
    // jimgina e'tiborsiz qolardi — moyillik ishlamay, hech kim
    // sezmasdi.
    const barchasi: FrageFormat[] = [
      'WORT_UZ',
      'UZ_WORT',
      'PAAR',
      'ARTIKEL',
      'LUECKE',
      'SATZ_BAUEN',
      'SATZ_UEBERSETZEN',
      'REAKTION',
      'ZUORDNEN',
      'DIALOG_LUECKE',
    ];
    for (const kind of ['SECTION_A', 'SECTION_B', 'BRIDGE', 'UNIT_TEST']) {
      for (const f of bevorzugteFormate(kind)) {
        expect(barchasi).toContain(f);
      }
    }
  });

  it('eski DiB darsida (kind null) moyillik yo`q', () => {
    expect(bevorzugteFormate(null)).toEqual([]);
  });

  it('notanish kind moyillikni buzmaydi', () => {
    expect(bevorzugteFormate('BOSHQA')).toEqual([]);
  });
});
