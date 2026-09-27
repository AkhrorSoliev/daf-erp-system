import { IsOptional, IsUUID } from 'class-validator';

export class DeparturePreviewQueryDto {
  // A removal names the one enrollment it closes; an expulsion or an archive
  // closes every open one, so it sends none.
  @IsOptional()
  @IsUUID()
  enrollmentId?: string;
}
