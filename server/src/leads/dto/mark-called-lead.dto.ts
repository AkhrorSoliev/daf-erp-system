import { IsBoolean } from 'class-validator';

export class MarkCalledLeadDto {
  // true  → stamp the lead as called (calledAt = now, calledBy = current user)
  // false → clear the marker
  @IsBoolean()
  called: boolean;
}
