import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGroupTeacherChangeReasonDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;
}
