import { Module } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptCodeListener } from './receipt-code.listener';

@Module({
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptCodeListener],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
