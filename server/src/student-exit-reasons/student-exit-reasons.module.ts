import { Module } from '@nestjs/common';
import { StudentExitReasonsService } from './student-exit-reasons.service';
import { StudentExitReasonsController } from './student-exit-reasons.controller';

@Module({
  controllers: [StudentExitReasonsController],
  providers: [StudentExitReasonsService],
  exports: [StudentExitReasonsService],
})
export class StudentExitReasonsModule {}
