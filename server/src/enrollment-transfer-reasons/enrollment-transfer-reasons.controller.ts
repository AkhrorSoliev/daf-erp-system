import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { EnrollmentTransferReasonsService } from './enrollment-transfer-reasons.service';
import { CreateEnrollmentTransferReasonDto } from './dto/create-enrollment-transfer-reason.dto';
import { UpdateEnrollmentTransferReasonDto } from './dto/update-enrollment-transfer-reason.dto';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';

@Controller('enrollment-transfer-reasons')
export class EnrollmentTransferReasonsController {
  constructor(
    private readonly reasonsService: EnrollmentTransferReasonsService,
  ) {}

  @Get()
  @Can('settings.reference', 'students.enroll', 'groups.manage')
  findAll(@CurrentUser('companyId') companyId: number) {
    return this.reasonsService.findAll(companyId);
  }

  @Post()
  @Can('settings.reference')
  create(
    @Body() dto: CreateEnrollmentTransferReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.reasonsService.create(dto, companyId, userId);
  }

  @Patch(':id')
  @Can('settings.reference')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEnrollmentTransferReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.reasonsService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  @Can('settings.reference')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.reasonsService.remove(id, companyId, userId);
  }
}
