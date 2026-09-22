import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { FrageFormat, ItemType } from '../uebung/frage.types';

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
  HOEREN_WAHL: true,
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
 * `ItemType`ning HAR BIR a'zosi — `FrageFormat` bilan bir xil sabab:
 * ro'yxat ikki DTO'da qo'lda yozilgan edi va yangi tur (`HOERFRAGE`)
 * unutilsa har javob `@IsIn` da 400 bilan qaytardi.
 */
const ALLE_ITEM_TYPEN: Record<ItemType, true> = {
  WORT: true,
  SATZ: true,
  PHRASE: true,
  DIALOGZEILE: true,
  HOERFRAGE: true,
};

export const ITEM_TYPEN = Object.keys(ALLE_ITEM_TYPEN) as ItemType[];

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
  @IsIn(ITEM_TYPEN)
  itemType!: ItemType;

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

  /**
   * Seans konteksti (dizayn 5.3). Hammasi IXTIYORIY: deploy oynasida eski
   * klient bularsiz yuboradi va `forbidNonWhitelisted` ostida rad
   * etilmasligi kerak. Bularsiz kelgan urinish savolga asoslangan
   * ko'rsatkichlardan chetda qoladi, xolos.
   */
  @IsOptional()
  @IsUUID('4')
  sessionId?: string;

  /** Asl savolning `PublicFrage.index`i — o'rinbosar ham SHU indeks bilan. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  questionIndex?: number;

  /** 1 — asl savol, 2 — xatodan keyingi o'rinbosar. */
  @IsOptional()
  @IsIn([1, 2])
  attemptNo?: 1 | 2;

  /** Takrorlash seansida yuborilmaydi. */
  @IsOptional()
  @IsInt()
  @Min(1)
  lessonId?: number;
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
  @IsIn(ITEM_TYPEN)
  itemType!: ItemType;

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

  /** Seans yakunini `DafSession` ga yozish uchun; eski klient yubormaydi. */
  @IsOptional()
  @IsUUID('4')
  sessionId?: string;
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

  /**
   * Seans konteksti (dizayn 5.3). Hammasi IXTIYORIY: deploy oynasida eski
   * klient bularsiz yuboradi va `forbidNonWhitelisted` ostida rad
   * etilmasligi kerak. Bularsiz kelgan urinish savolga asoslangan
   * ko'rsatkichlardan chetda qoladi, xolos.
   */
  @IsOptional()
  @IsUUID('4')
  sessionId?: string;

  /** Asl savolning `PublicFrage.index`i — o'rinbosar ham SHU indeks bilan. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  questionIndex?: number;

  /** 1 — asl savol, 2 — xatodan keyingi o'rinbosar. */
  @IsOptional()
  @IsIn([1, 2])
  attemptNo?: 1 | 2;

  /** Takrorlash seansida yuborilmaydi. */
  @IsOptional()
  @IsInt()
  @Min(1)
  lessonId?: number;
}

/**
 * Takrorlash seansi yakuni. Dars yo'q — faqat seans. `sessionId` MAJBURIY:
 * bu endpoint faqat yangi klientdan chaqiriladi, unda yozadigan boshqa
 * hech narsa yo'q.
 */
export class WiederholungAbschlussDto {
  @IsUUID('4')
  sessionId!: string;
}
