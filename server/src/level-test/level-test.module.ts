import { Module } from '@nestjs/common';
import { StudentLevelTestsController } from './level-test.controller';
import { LevelTestResultsService } from './level-test-results.service';

/**
 * Daraja testi natijalarini o'qish (ADR-0122). Test o'zi `TelegramModule`
 * ichidagi sahnada yuradi; bu modul faqat o'qiydi, shuning uchun
 * `TelegramModule` uni import qila oladi (halqa yo'q).
 */
@Module({
  controllers: [StudentLevelTestsController],
  providers: [LevelTestResultsService],
  exports: [LevelTestResultsService],
})
export class LevelTestModule {}
