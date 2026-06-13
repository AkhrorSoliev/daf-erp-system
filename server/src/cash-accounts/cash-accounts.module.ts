import { Module } from '@nestjs/common';
import { CashAccountsService } from './cash-accounts.service';
import { CashMovementsService } from './cash-movements.service';
import { CashAccountsController } from './cash-accounts.controller';

// CashMovementsService is exported so the payment / expense / salary / refund
// write paths can append cash movements inside their own Serializable tx.
@Module({
  controllers: [CashAccountsController],
  providers: [CashAccountsService, CashMovementsService],
  exports: [CashMovementsService, CashAccountsService],
})
export class CashAccountsModule {}
