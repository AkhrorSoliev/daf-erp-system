import { IsIn } from 'class-validator';
import { LERNEN_TEMA_IDLARI } from '../../common/lernen-temalar';

/** The student's own Ta'lim look (ADR-0125): one of the known ids, nothing else. */
export class UpdateLernenTemaDto {
  @IsIn(LERNEN_TEMA_IDLARI, { message: "Noma'lum ko'rinish" })
  tema!: string;
}
