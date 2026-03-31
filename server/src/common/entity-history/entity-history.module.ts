import { Global, Module } from '@nestjs/common';
import { EntityHistoryService } from './entity-history.service';
import { EntityHistoryController } from './entity-history.controller';

@Global()
@Module({
  controllers: [EntityHistoryController],
  providers: [EntityHistoryService],
  exports: [EntityHistoryService],
})
export class EntityHistoryModule {}
