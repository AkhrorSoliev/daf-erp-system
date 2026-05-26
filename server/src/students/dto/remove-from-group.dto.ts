import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RemoveFromGroupDto {
  // ID of a configured StudentExitReason with appliesTo: GROUP_REMOVAL.
  // Service-level validation enforces that one of the two is supplied
  // depending on whether configured reasons exist for the company.
  @IsOptional()
  @IsUUID()
  departureReasonId?: string;

  // Free-text fallback when no configured reasons exist for the company,
  // OR additional comment alongside a selected reasonId.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  // "Yo'qolgan o'quvchi" flow — when true, the service must also clear
  // the current-cycle portion of this student's debt as part of the
  // same atomic removal. Frontend sets this when the admin ticks the
  // checkbox inside the remove-from-group dialog. Eligibility is
  // re-verified server-side; an ineligible student bubbles up as 400.
  @IsOptional()
  @IsBoolean()
  writeOffCycleDebt?: boolean;

  // Required when writeOffCycleDebt = true. Mirrors the admin-typed
  // explanation that lands in the DEBT_WRITE_OFF transaction metadata
  // and the entity history audit row.
  @ValidateIf((o: RemoveFromGroupDto) => o.writeOffCycleDebt === true)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  writeOffReason?: string;

  // Required when writeOffCycleDebt = true. The exact amount the
  // backend computed and the frontend displayed (suggestedWriteOff).
  // The service compares this against the freshly-recomputed value
  // inside the tx to defend against drift between the eligibility
  // read and the write — if they disagree the request is rejected.
  @ValidateIf((o: RemoveFromGroupDto) => o.writeOffCycleDebt === true)
  @IsInt()
  @Min(1)
  writeOffConfirmAmount?: number;
}
