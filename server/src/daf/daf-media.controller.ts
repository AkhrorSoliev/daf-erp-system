import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import {
  DafMediaOverviewService,
  type MediaOverview,
} from './media/daf-media-overview.service';

/**
 * Media bo'limi — yasalgan kontentni KO'RSATADI, yaratmaydi.
 * Yozish imkoniyati studiya qurilganda qo'shiladi.
 */
@Controller('daf/media')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class DafMediaController {
  constructor(private readonly service: DafMediaOverviewService) {}

  @Get('overview')
  overview(): MediaOverview {
    return this.service.overview();
  }
}
