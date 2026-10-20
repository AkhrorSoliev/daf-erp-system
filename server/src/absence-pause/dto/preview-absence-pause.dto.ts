import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** Sozlama sahifasi: «shu chegarada hozir nechta o'quvchi pauzaga tushadi?» */
export class PreviewAbsencePauseDto {
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(20)
  pauseThreshold!: number;
}
