import { ohneWiederholteFormate } from './wiederholte-formate';
import type { Frage, FrageFormat } from './frage.types';

function f(format: FrageFormat, itemId: number, belegteItems?: string[]): Frage {
  return {
    format,
    itemType: 'WORT',
    itemId,
    prompt: `p${itemId}`,
    hilfe: null,
    options: [],
    richtig: 'x',
    akzeptiert: [],
    belegteItems: belegteItems ?? [`WORT:${itemId}`],
    audioUrl: null,
  };
}

describe('ohneWiederholteFormate', () => {
  it('so`z avvalgi safar aynan SHU formatda so`ralgan bo`lsa, nomzod chetlatiladi', () => {
    const letzter = new Map<number, string | null>([[5, 'WORT_UZ']]);
    const natija = ohneWiederholteFormate([f('WORT_UZ', 5), f('UZ_WORT', 5)], letzter);
    expect(natija.map((k) => k.format)).toEqual(['UZ_WORT']);
  });

  // Finding 2: eski kod faqat WORT_UZ/UZ_WORT/ARTIKEL uchun tekshirardi
  // — LUECKE va PAAR ham xuddi shu `belegteItems: ['WORT:<id>']`
  // identifikatsiyasini olib yuradi va shu qoidaga bo'ysunishi kerak,
  // hech qanday hand-listed ro'yxatga qo'shilmasdan.
  it('LUECKE ham xuddi shu qoidaga bo`ysunadi — hand-listed ro`yxatda YO`Q edi', () => {
    const letzter = new Map<number, string | null>([[5, 'LUECKE']]);
    const natija = ohneWiederholteFormate([f('LUECKE', 5), f('WORT_UZ', 5)], letzter);
    expect(natija.map((k) => k.format)).toEqual(['WORT_UZ']);
  });

  it('PAAR — to`rtta so`zdan BIRI o`tgan safar PAAR formatida so`ralgan bo`lsa, butun juftlik chetlatiladi', () => {
    const letzter = new Map<number, string | null>([[2, 'PAAR']]);
    const juftlik = f('PAAR', 1, ['WORT:1', 'WORT:2', 'WORT:3', 'WORT:4']);
    expect(ohneWiederholteFormate([juftlik], letzter)).toHaveLength(0);
  });

  it('boshqa so`z yoki boshqa formatga tegmaydi', () => {
    const letzter = new Map<number, string | null>([[5, 'WORT_UZ']]);
    const natija = ohneWiederholteFormate([f('WORT_UZ', 6), f('UZ_WORT', 5)], letzter);
    expect(natija).toHaveLength(2);
  });

  it('SATZ/PHRASE identifikatsiyali nomzodlarga tegmaydi (qoida faqat WORT uchun)', () => {
    const letzter = new Map<number, string | null>([[9, 'SATZ_BAUEN']]);
    const satzNomzod: Frage = {
      format: 'SATZ_BAUEN',
      itemType: 'SATZ',
      itemId: 9,
      prompt: 'p',
      hilfe: null,
      options: [],
      richtig: 'x',
      akzeptiert: [],
      belegteItems: ['SATZ:9'],
      audioUrl: null,
    };
    expect(ohneWiederholteFormate([satzNomzod], letzter)).toEqual([satzNomzod]);
  });

  it('lastFormat null yoki xarita ichida yo`q bo`lsa — hech narsa chetlatilmaydi', () => {
    const letzter = new Map<number, string | null>([[5, null]]);
    const natija = ohneWiederholteFormate([f('WORT_UZ', 5), f('UZ_WORT', 7)], letzter);
    expect(natija).toHaveLength(2);
  });
});
