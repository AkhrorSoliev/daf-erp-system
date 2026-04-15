import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractQueryDto } from './dto/contract-query.dto';
import { ChangeContractStatusDto } from './dto/change-contract-status.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('contracts')
@UseGuards(RolesGuard)
export class ContractsController {
  constructor(private contractsService: ContractsService) {}

  @Post()
  @Roles('CEO', 'Branch Director', 'Administrator')
  create(
    @Body() dto: CreateContractDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.contractsService.create(dto, userId, companyId);
  }

  @Get()
  @Roles('CEO', 'Branch Director', 'Administrator')
  findAll(
    @Query() query: ContractQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.contractsService.findAll(query, companyId);
  }

  @Get(':id')
  @Roles('CEO', 'Branch Director', 'Administrator')
  findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @Get('student/:studentId')
  @Roles('CEO', 'Branch Director', 'Administrator')
  findByStudent(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query() query: ContractQueryDto,
  ) {
    return this.contractsService.findByStudent(studentId, query);
  }

  @Patch(':id')
  @Roles('CEO', 'Branch Director', 'Administrator')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.contractsService.update(id, dto, userId);
  }

  @Patch(':id/status')
  @Roles('CEO', 'Branch Director')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeContractStatusDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.contractsService.changeStatus(id, dto, userId);
  }
}
