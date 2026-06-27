import { IsBoolean, IsString } from 'class-validator';

export class RestoreLeadSectionDto {
  // The column the section should land in (its original column may be gone).
  @IsString()
  targetColumnId: string;

  // When true, the leads cascade-archived with this section are restored too.
  @IsBoolean()
  withLeads: boolean;
}
