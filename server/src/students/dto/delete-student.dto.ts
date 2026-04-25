import { IsString, MaxLength, MinLength } from 'class-validator';

export class DeleteStudentDto {
  @IsString()
  @MinLength(3, {
    message: "O'chirish sababi kamida 3 ta belgidan iborat bo'lishi kerak",
  })
  @MaxLength(500)
  reason: string;
}
