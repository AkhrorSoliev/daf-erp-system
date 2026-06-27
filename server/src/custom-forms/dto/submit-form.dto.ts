import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitFormDto {
  @IsObject()
  data: Record<string, unknown>;

  // Optional source tag carried by the share link (?source=Instagram). When
  // present, the created lead is attributed to a LeadSource with this name
  // (found case-insensitively or created on the fly), so each tagged link
  // tracks which channel/ad the lead came from.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;
}
