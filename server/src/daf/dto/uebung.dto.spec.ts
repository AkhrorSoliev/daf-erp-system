import 'reflect-metadata';
import { FRAGE_FORMATLAR } from './uebung.dto';

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
