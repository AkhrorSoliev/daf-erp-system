import { IsNotEmpty, IsString, Length } from 'class-validator';

export class OtpExchangeDto {
  @IsNotEmpty()
  @IsString()
  @Length(4, 6)
  code: string;
}
