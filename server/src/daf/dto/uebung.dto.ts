import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { FrageFormat } from '../uebung/frage.types';

/**
 * `FrageFormat`ning HAR BIR a'zosi — `Record<FrageFormat, true>` orqali,
 * TypeScript compiler MAJBURLAYDIGAN to'liqlik bilan.
 *
 * Oddiy `FrageFormat[]` (avvalgi shakl) qo'lda yozilardi va yangi format
 * `FrageFormat` union'iga qo'shilganda jimgina eskirib qolardi — natija
 * `@IsIn` orqali o'sha formatdagi HAR BIR to'g'ri javobni 400 bilan rad
 * etardi (aynan shu narsa `AUDIO_WORT`/`WORT_TIPPEN` bilan sodir bo'lgan
 * edi). `Record<FrageFormat, true>` kalit tushib qolishini TEST emas,
 * KOMPILYATOR ushlab turadi: union'ga o'n uchinchi format qo'shilib, shu
 * yerga yozilmasa, `npm run typecheck` "Property '...' is missing" bilan
 * yiqiladi — massiv esa shu to'liq ro'yxatdan HOSIL QILINADI, qo'lda emas.
 */
const ALLE_FRAGE_FORMATLAR: Record<FrageFormat, true> = {
  WORT_UZ: true,
  UZ_WORT: true,
  PAAR: true,
  ARTIKEL: true,
  LUECKE: true,
  SATZ_BAUEN: true,
  SATZ_UEBERSETZEN: true,
  REAKTION: true,
  ZUORDNEN: true,
  DIALOG_LUECKE: true,
  AUDIO_WORT: true,
  WORT_TIPPEN: true,
};

/**
 * `FrageFormat`ning barcha qiymatlari — DTO validatsiyasida (`@IsIn`)
 * bir joydan. EXPORT QILINGAN: `uebung.dto.spec.ts` `@IsIn` simini
 * to'g'ridan-to'g'ri shu massiv orqali tekshiradi.
 */
export const FRAGE_FORMATLAR = Object.keys(
  ALLE_FRAGE_FORMATLAR,
) as FrageFormat[];

/**
 * Mashq javobi.
 *
 * `studentId` maydoni ATAYLAB YO'Q — u faqat tokendan olinadi.
 * To'g'ri javob ham kirmaydi: tekshiruv serverda.
 *
 * Mijoz QAYSI material bo'yicha javob berganini aytadi (`itemType`,
 * `itemId`), savolning dars ichidagi o'rnini emas. Sabab dizaynda (D7):
 * seans har o'quvchida boshqacha quriladi, ya'ni «o'rin» bo'yicha
 * savolni qayta qurib bo'lmaydi.
 */
export class CheckAntwortDto {
  @IsIn(['WORT', 'SATZ', 'PHRASE', 'DIALOGZEILE'])
  itemType!: 'WORT' | 'SATZ' | 'PHRASE' | 'DIALOGZEILE';

  @IsInt()
  itemId!: number;

  @IsIn(FRAGE_FORMATLAR)
  format!: FrageFormat;

  @IsString()
  @MaxLength(500)
  given!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  durationMs?: number;
}

/**
 * `GET .../uebung/ersatz` so'rov parametrlari.
 *
 * Mijoz noto'g'ri javob bergan savolni qayta ko'rsatolmaydi (D7) —
 * o'sha material haqida BOSHQA formatda savol so'rash uchun shu uchta
 * maydon yetarli: qaysi material, qaysi format allaqachon ko'rsatilgan.
 * `studentId` bu yerda ham YO'Q — tokendan olinadi.
 */
export class ErsatzQueryDto {
  @IsIn(['WORT', 'SATZ', 'PHRASE', 'DIALOGZEILE'])
  itemType!: 'WORT' | 'SATZ' | 'PHRASE' | 'DIALOGZEILE';

  @Type(() => Number)
  @IsInt()
  itemId!: number;

  @IsIn(FRAGE_FORMATLAR)
  nichtFormat!: FrageFormat;
}

/**
 * Seans yakuni.
 *
 * `studentId` maydoni ATAYLAB YO'Q — u tokendan olinadi.
 */
export class AbschlussDto {
  @IsInt()
  @Min(0)
  richtig!: number;

  @IsInt()
  @Min(1)
  @Max(100)
  gesamt!: number;

  /**
   * Kelajakka mo'ljallab qabul qilinadi va tekshiriladi, lekin HOZIRCHA
   * HECH QAYERGA YOZILMAYDI — `DafLessonProgress`da bu qiymat uchun ustun
   * yo'q (`UebungService.abschluss` uni faqat qabul qiladi, saqlamaydi).
   * Maydonni olib tashlamang: `whitelist: true, forbidNonWhitelisted: true`
   * ostida mijozning uni yuboradigan mavjud so'rovi rad etilib qolardi.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  durationMs?: number;
}

/**
 * Bitta juft — jonli tekshiruv uchun.
 *
 * `studentId` maydoni ATAYLAB YO'Q: u tokendan olinadi. Javob ham faqat
 * `ha`/`yo'q` — to'g'ri javobning o'zi hech qachon qaytarilmaydi.
 */
export class JuftDto {
  @IsIn(['WORT', 'PHRASE'])
  itemType!: 'WORT' | 'PHRASE';

  @IsInt()
  itemId!: number;

  // Faqat juftlash formatlari: qolganlarida "juft" degan tushuncha yo'q.
  @IsIn(['PAAR', 'ZUORDNEN'])
  format!: 'PAAR' | 'ZUORDNEN';

  @IsString()
  @MaxLength(200)
  chap!: string;

  @IsString()
  @MaxLength(200)
  ong!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  durationMs?: number;
}
