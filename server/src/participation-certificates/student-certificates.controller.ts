import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { ParticipationCertificatesService } from './participation-certificates.service';

/**
 * The student card's «Hujjatlar» tab. No new capability: reading is what the
 * card's other tabs need (`students.details`), issuing is a change to the
 * student's record (`students.manage`). The student's branch is checked
 * inside the service (`assertCallerMayTouchStudent`).
 */
@Controller('students')
export class StudentCertificatesController {
  constructor(
    private readonly certificates: ParticipationCertificatesService,
  ) {}

  @Get(':id/participation-certificates/preview')
  @Can('students.details')
  preview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.certificates.preview(userId, companyId, id);
  }

  @Post(':id/participation-certificates')
  @Can('students.manage')
  issue(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssueCertificateDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.certificates.issue(userId, companyId, id, dto);
  }
}
