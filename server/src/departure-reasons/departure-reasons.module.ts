import { Module } from '@nestjs/common';
import { DepartureReasonsService } from './departure-reasons.service';
import { DepartureReasonsController } from './departure-reasons.controller';

@Module({
  controllers: [DepartureReasonsController],
  providers: [DepartureReasonsService],
  exports: [DepartureReasonsService],
})
export class DepartureReasonsModule {}
