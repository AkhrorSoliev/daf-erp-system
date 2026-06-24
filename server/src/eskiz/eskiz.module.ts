import { Module } from '@nestjs/common';
import { EskizService } from './eskiz.service';

/**
 * Eskiz.uz SMS gateway. ConfigService + RedisService come from global modules,
 * so no imports are needed here. Import this module wherever SMS sending is used.
 */
@Module({
  providers: [EskizService],
  exports: [EskizService],
})
export class EskizModule {}
