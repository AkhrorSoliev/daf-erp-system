import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateEnrollmentTransferReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
