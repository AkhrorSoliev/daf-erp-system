import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { StudentPortalReadService } from './student-portal-read.service';
import { StudentPortalWriteService } from './student-portal-write.service';
import { ChangePortalPasswordDto } from './dto/change-portal-password.dto';
import { UpdatePortalNameDto } from './dto/update-portal-name.dto';

@Injectable()
export class StudentPortalService {
  constructor(
    private read: StudentPortalReadService,
    private write: StudentPortalWriteService,
  ) {}

  // Reads
  getProfile(studentId: number) {
    return this.read.getProfile(studentId);
  }
  getSchedule(studentId: number) {
    return this.read.getSchedule(studentId);
  }
  getAttendanceHistory(studentId: number) {
    return this.read.getAttendanceHistory(studentId);
  }
  getAttendanceStats(studentId: number) {
    return this.read.getAttendanceStats(studentId);
  }
  getPaymentHistory(studentId: number) {
    return this.read.getPaymentHistory(studentId);
  }

  // Writes
  updateName(studentId: number, dto: UpdatePortalNameDto, userId: number) {
    return this.write.updateName(studentId, dto, userId);
  }
  changePassword(
    userId: number,
    studentId: number,
    dto: ChangePortalPasswordDto,
  ) {
    return this.write.changePassword(userId, studentId, dto);
  }
  updatePhoto(studentId: number, file: Express.Multer.File, userId: number) {
    return this.write.updatePhoto(studentId, file, userId);
  }
  removePhoto(studentId: number, userId: number) {
    return this.write.removePhoto(studentId, userId);
  }
  createPaymentIntent(params: {
    studentId: number;
    companyId: number;
    provider: PaymentMethod;
    amountSom: number;
  }) {
    return this.write.createPaymentIntent(params);
  }
}
