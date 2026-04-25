import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateGroupTeacherChangeReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
