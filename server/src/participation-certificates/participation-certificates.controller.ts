import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Public } from '../common/decorators';
import { IpThrottlerGuard } from '../common/guards';
import { Can, CeoOnly } from '../common/permissions/access.decorators';
import { ParticipationSettingsDto } from './dto/participation-settings.dto';
import { ParticipationCertificatesService } from './participation-certificates.service';
import { ParticipationSettingsService } from './participation-settings.service';

@Controller('participation-certificates')
export class ParticipationCertificatesController {
  constructor(
    private readonly certificates: ParticipationCertificatesService,
    private readonly settings: ParticipationSettingsService,
  ) {}

  /** The CEO's thresholds (Sozlamalar → «Qatnashganlik hujjati»). */
  @Get('settings')
  @CeoOnly()
  getSettings(@CurrentUser('companyId') companyId: number) {
    return this.settings.read(companyId);
  }

  @Patch('settings')
  @CeoOnly()
  setSettings(
    @Body() dto: ParticipationSettingsDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.settings.update(companyId, dto, userId);
  }

  @Get(':id/pdf')
  @Can('students.details')
  async pdf(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.certificates.pdf(
      userId,
      companyId,
      id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /**
   * What the QR code opens. The UUID in the path is the access token, like
   * the receipt's (`/r/<id>`); the answer carries no branch, birth date or
   * percentage.
   */
  @Public()
  @UseGuards(IpThrottlerGuard)
  @Get(':id/verify')
  verify(@Param('id') id: string) {
    return this.certificates.verify(id);
  }
}
