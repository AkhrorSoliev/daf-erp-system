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
import { EnrollmentTransferReasonsService } from './enrollment-transfer-reasons.service';
import { CreateEnrollmentTransferReasonDto } from './dto/create-enrollment-transfer-reason.dto';
import { UpdateEnrollmentTransferReasonDto } from './dto/update-enrollment-transfer-reason.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('enrollment-transfer-reasons')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class EnrollmentTransferReasonsController {
  constructor(
    private readonly reasonsService: EnrollmentTransferReasonsService,
  ) {}

  @Get()
  findAll(@CurrentUser('companyId') companyId: number) {
    return this.reasonsService.findAll(companyId);
  }

  @Post()
  create(
    @Body() dto: CreateEnrollmentTransferReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.reasonsService.create(dto, companyId, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEnrollmentTransferReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.reasonsService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.reasonsService.remove(id, companyId, userId);
  }
}
