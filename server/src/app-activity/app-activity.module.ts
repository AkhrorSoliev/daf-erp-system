import { Module } from '@nestjs/common';
import { StudentActivityController } from './student-activity.controller';
import { AppActivityWriteService } from './app-activity-write.service';

@Module({
  controllers: [StudentActivityController],
  providers: [AppActivityWriteService],
  exports: [AppActivityWriteService],
})
export class AppActivityModule {}
