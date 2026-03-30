import { Global, Module } from '@nestjs/common';
import { StatusHistoryService } from './status-history.service';
import { StatusCascadeService } from './status-cascade.service';

@Global()
@Module({
  providers: [StatusHistoryService, StatusCascadeService],
  exports: [StatusHistoryService, StatusCascadeService],
})
export class StatusHistoryModule {}
