import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { SaveAttendanceDto } from './save-attendance.dto';

/** «Bo'ldi» — the register of a lesson nobody marked in time (ADR-0054). */
export class LateAttendanceDto extends SaveAttendanceDto {
  /** CEO only (Q9): the teacher could not mark it — the lesson pays as usual. */
  @IsOptional()
  @IsBoolean()
  teacherPayExempt?: boolean;

  @ValidateIf((o: LateAttendanceDto) => o.teacherPayExempt === true)
  @IsString()
  @IsNotEmpty({ message: 'Sababini yozing' })
  @MaxLength(500)
  exemptReason?: string;
}
