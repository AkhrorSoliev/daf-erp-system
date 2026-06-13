import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CashAccountsService } from './cash-accounts.service';
import { CreateCashAccountDto } from './dto/create-cash-account.dto';
import { UpdateCashAccountDto } from './dto/update-cash-account.dto';
import { CashAccountQueryDto } from './dto/cash-account-query.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { TransferDto } from './dto/transfer.dto';
import { ReconcileDto } from './dto/reconcile.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

// Cash accounts are financial configuration → CEO and Branch Director only
// (mirrors salary config + financial reports access).
@Controller('cash-accounts')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director')
export class CashAccountsController {
  constructor(private cashAccountsService: CashAccountsService) {}

  @Get()
  findAll(
    @Query() query: CashAccountQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.cashAccountsService.findAll(query, companyId, userId, roles);
  }

  @Post()
  create(
    @Body() dto: CreateCashAccountDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.cashAccountsService.create(dto, userId, companyId);
  }

  @Post('transfer')
  transfer(
    @Body() dto: TransferDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.cashAccountsService.transfer(dto, userId, companyId);
  }

  @Get(':id/movements')
  getMovements(
    @Param('id') id: string,
    @Query() query: MovementQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.cashAccountsService.getMovements(id, query, companyId);
  }

  @Post(':id/reconcile')
  reconcile(
    @Param('id') id: string,
    @Body() dto: ReconcileDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.cashAccountsService.reconcile(id, dto, userId, companyId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCashAccountDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.cashAccountsService.update(id, dto, userId, companyId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.cashAccountsService.remove(id, userId, companyId);
  }
}
