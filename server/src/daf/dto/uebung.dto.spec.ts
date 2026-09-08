import 'reflect-metadata';
import { FRAGE_FORMATLAR } from './uebung.dto';

/**
 * `FRAGE_FORMATLAR` — `CheckAntwortDto.format` va
 * `ErsatzQueryDto.nichtFormat` uchun `@IsIn` ro'yxati.
 *
 * Bu oddiy `FrageFormat[]`, `Record<FrageFormat, …>` kabi exhaustive
 * EMAS: `FrageFormat`ga yangi qiymat qo'shilib, bu ro'yxat unutilsa,
 * TypeScript jim qoladi — mijoz savolni ko'radi, lekin javob yuborish
 * yoki `ersatz` so'rovi 400 bilan qaytadi (ko'rikdan qaytgan haqiqiy
 * topilma: `AUDIO_WORT`/`WORT_TIPPEN` uchun aynan shu narsa sodir
 * bo'lgan edi). Shu test ro'yxatning to'liqligini PINLAYDI, shuning
 * uchun keyingi format qo'shilganda BU YERDA aniq yiqiladi.
 */
describe('FRAGE_FORMATLAR', () => {
  it("hozirgi 12 ta FrageFormat qiymatining barchasini o'z ichiga oladi", () => {
    expect(FRAGE_FORMATLAR).toHaveLength(12);
    expect(FRAGE_FORMATLAR).toEqual(
      expect.arrayContaining(['AUDIO_WORT', 'WORT_TIPPEN']),
    );
  });
});
