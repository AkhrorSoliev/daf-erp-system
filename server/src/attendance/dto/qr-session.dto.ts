import { IsDateString, IsString, IsUUID } from 'class-validator';

export class StartQrSessionDto {
  @IsDateString()
  date: string;
}

export class RotateQrTokenDto {
  @IsUUID()
  sessionId: string;

  @IsDateString()
  date: string;
}

export class StopQrSessionDto {
  @IsUUID()
  sessionId: string;

  @IsDateString()
  date: string;
}

export class ScanQrDto {
  @IsString()
  token: string;
}
