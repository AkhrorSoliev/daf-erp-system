import { IsIn, IsOptional } from 'class-validator';

export class AppActivityQueryDto {
  @IsOptional()
  @IsIn(['7', '30'])
  period?: string;
}
