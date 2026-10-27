import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { SAVOL_SONI } from '../jang/jang-qoidalari';

/** `POST .../jang/:id/javob` — bo'sh `javob` = vaqt tugadi. */
export class JangJavobDto {
  @IsInt()
  @Min(0)
  @Max(SAVOL_SONI - 1)
  pozitsiya!: number;

  @IsString()
  @MaxLength(200)
  javob!: string;
}
