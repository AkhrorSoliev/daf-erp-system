import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Deleting a lead is treated as marking it LOST, so a reason is mandatory —
 * it is stored on the archived lead (statusEnum=LOST, lostReason) and shown in
 * the leads archive + audit trail.
 */
export class RemoveLeadDto {
  @IsString()
  @IsNotEmpty({ message: "Yo'qotilish sababini kiriting" })
  @MaxLength(500)
  reason: string;
}
