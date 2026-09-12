import 'reflect-metadata';
import { FRAGE_FORMATLAR, ITEM_TYPEN } from './uebung.dto';

/**
 * `FRAGE_FORMATLAR` — `CheckAntwortDto.format` va
 * `ErsatzQueryDto.nichtFormat` uchun `@IsIn` ro'yxati.
 *
 * TO'LIQLIKNI ENDI KOMPILYATOR KAFOLATLAYDI (`uebung.dto.ts`dagi
 * `Record<FrageFormat, true>` orqali) — shuning uchun bu yerda uzunlik
 * pinlanmaydi: qattiq sonli `toHaveLength` faqat keyingi ishlab
 * chiquvchini sonni yangilashga majburlardi, hech qanday himoya
 * bermasdan. Bu test faqat `@IsIn` simida ikkala yangi format haqiqatda
 * BORLIGINI tekshiradi — massivning o'zi to'g'ri quruvchidan
 * (`ALLE_FRAGE_FORMATLAR`) kelayotganini kompilyator allaqachon
 * ta'minlagan.
 */
describe('FRAGE_FORMATLAR', () => {
  it("AUDIO_WORT va WORT_TIPPEN ro'yxatda bor — @IsIn simi ikkalasini ham qamraydi", () => {
    expect(FRAGE_FORMATLAR).toEqual(
      expect.arrayContaining(['AUDIO_WORT', 'WORT_TIPPEN']),
    );
  });
});

describe('ITEM_TYPEN', () => {
  it("HOERFRAGE ro'yxatda bor — @IsIn simi eshitish javobini rad etmaydi", () => {
    // Ilgari bu ro'yxat ikki DTO'da QO'LDA yozilgan edi; unutilsa har
    // eshitish javobi 400 bilan qaytardi — aynan AUDIO_WORT bilan
    // bo'lgan xato, faqat itemType tomonida.
    expect(ITEM_TYPEN).toEqual(
      expect.arrayContaining([
        'WORT',
        'SATZ',
        'PHRASE',
        'DIALOGZEILE',
        'HOERFRAGE',
      ]),
    );
  });
});
