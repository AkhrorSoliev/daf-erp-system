import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class EnrollPreviewQueryDto {
  @IsString()
  @IsNotEmpty()
  groupId: string;

  // The day the enroll dialog would send, in the format `enrollToGroup`
  // accepts; omitted means today, as there.
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Boshlanish sanasi YYYY-MM-DD formatida bo'lishi kerak",
  })
  startDate?: string;
}
