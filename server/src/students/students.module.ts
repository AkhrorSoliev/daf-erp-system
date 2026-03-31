import { Module } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { UploadModule } from '../upload/upload.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [UploadModule, SmsModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
