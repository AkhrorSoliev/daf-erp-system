import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Archiving a student. The card's «Arxivga o'tkazish» types the reason; the
 * status dialog picks one from the ARCHIVE list (`reasonId`) and may add a
 * comment in `reason`. Which of the two is required is the service's call,
 * as for a status change.
 */
export class DeleteStudentDto {
  @IsOptional()
  @IsUUID()
  reasonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
