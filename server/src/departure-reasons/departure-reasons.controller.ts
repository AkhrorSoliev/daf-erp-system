import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DepartureReasonsService } from './departure-reasons.service';
import { CreateDepartureReasonDto } from './dto/create-departure-reason.dto';
import { UpdateDepartureReasonDto } from './dto/update-departure-reason.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('departure-reasons')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class DepartureReasonsController {
  constructor(
    private readonly departureReasonsService: DepartureReasonsService,
  ) {}

  @Get()
  findAll(@CurrentUser('companyId') companyId: number) {
    return this.departureReasonsService.findAll(companyId);
  }

  @Post()
  create(
    @Body() dto: CreateDepartureReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.departureReasonsService.create(dto, companyId, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDepartureReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.departureReasonsService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.departureReasonsService.remove(id, companyId, userId);
  }
}
