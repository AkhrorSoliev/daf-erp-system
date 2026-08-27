import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Urinish yozish uchun kirish.
 *
 * `studentId` maydoni ATAYLAB YO'Q. U faqat tokendan olinadi
 * (`@CurrentUser('studentId')`) — DTO'da bo'lsa, har qanday o'quvchi
 * boshqasining nomidan urinish yozib, uning natijasini buzishi mumkin
 * bo'lardi.
 *
 * To'g'ri javob ham kirmaydi: tekshiruv serverda.
 */
export class CreateAttemptDto {
  @IsInt()
  exerciseId!: number;

  /** O'quvchi tanlagan variant matni. */
  @IsString()
  @MaxLength(1000)
  given!: string;

  /**
   * Mashqqa ketgan vaqt. Kelajakda kerak bo'ladi: ikki soniyada «to'g'ri»
   * qilgan o'quvchi o'ylamagan. Yuqori chegara — mijoz bergan raqam,
   * shuning uchun ishonchsiz; bir kundan oshgani ma'nosiz.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  durationMs?: number;
}

/**
 * Lug'at mashqiga javob.
 *
 * `answer` maydoni YO'Q va bo'lishi ham mumkin emas: mijoz to'g'ri
 * javobni bilmaydi. U faqat SAVOL O'RNINI va o'z tanlovini yuboradi,
 * server esa savolni qayta tug'ib solishtiradi.
 */
export class CheckDrillDto {
  @IsInt()
  lessonId!: number;

  /** Savolning dars ichidagi o'rni. */
  @IsInt()
  @Min(0)
  index!: number;

  @IsString()
  @MaxLength(500)
  given!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  durationMs?: number;
}
