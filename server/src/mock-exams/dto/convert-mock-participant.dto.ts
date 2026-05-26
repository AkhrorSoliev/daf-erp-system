import { IsInt, Min } from 'class-validator';

/**
 * Promotes a mock-only participant to a real DaF student. Branch is the
 * minimum operational info needed to make the new student usable; course /
 * group enrollment is a follow-up step the admin handles via the regular
 * student profile.
 */
export class ConvertMockParticipantDto {
  @IsInt()
  @Min(1)
  branchId: number;
}
