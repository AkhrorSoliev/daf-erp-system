import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class RemoveMockParticipantQueryDto {
  /**
   * To'lagan ishtirokchini o'chirishda majburiy: admin pulni odamga
   * qaytarganini tasdiqlaydi. Busiz servis o'chirishni rad etadi.
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  refundConfirmed?: boolean;
}
