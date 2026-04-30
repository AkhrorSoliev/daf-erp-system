import { IsDateString, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateLessonCancellationDto {
  @IsString()
  @IsNotEmpty()
  groupId: string;

  // YYYY-MM-DD; the date the lesson was supposed to happen.
  @IsDateString()
  date: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
