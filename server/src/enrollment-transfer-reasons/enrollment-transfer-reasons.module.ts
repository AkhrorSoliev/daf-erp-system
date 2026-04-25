import { Module } from '@nestjs/common';
import { EnrollmentTransferReasonsService } from './enrollment-transfer-reasons.service';
import { EnrollmentTransferReasonsController } from './enrollment-transfer-reasons.controller';

@Module({
  controllers: [EnrollmentTransferReasonsController],
  providers: [EnrollmentTransferReasonsService],
  exports: [EnrollmentTransferReasonsService],
})
export class EnrollmentTransferReasonsModule {}
