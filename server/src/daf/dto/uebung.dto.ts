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
  @IsIn(['WORT', 'SATZ', 'PHRASE'])
  itemType!: 'WORT' | 'SATZ' | 'PHRASE';

  @IsInt()
  itemId!: number;

  @IsIn([
    'WORT_UZ',
    'UZ_WORT',
    'PAAR',
    'ARTIKEL',
    'LUECKE',
    'SATZ_BAUEN',
    'SATZ_UEBERSETZEN',
    'REAKTION',
  ])
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
