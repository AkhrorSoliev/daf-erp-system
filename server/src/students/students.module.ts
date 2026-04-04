import { Module } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { StudentPortalController } from './student-portal.controller';
import { StudentPortalService } from './student-portal.service';
import { UploadModule } from '../upload/upload.module';
import { SmsModule } from '../sms/sms.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [UploadModule, SmsModule, AttendanceModule],
  controllers: [StudentsController, StudentPortalController],
  providers: [StudentsService, StudentPortalService],
  exports: [StudentsService],
})
export class StudentsModule {}
