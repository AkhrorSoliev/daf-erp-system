import { IsEnum } from 'class-validator';
import { DafDailyGoal } from '@prisma/client';

/** `PATCH .../maqsad` tanasi — uch darajadan biri (spec S2 1.3). */
export class MaqsadDto {
  @IsEnum(DafDailyGoal)
  daraja!: DafDailyGoal;
}
