import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateMockExamSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: "Rang #RGB yoki #RRGGBB formatida bo'lishi kerak",
  })
  color?: string | null;
}
