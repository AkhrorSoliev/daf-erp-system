import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import {
  DafMediaOverviewService,
  type MediaOverview,
} from './media/daf-media-overview.service';
import {
  DafMediaCoverageService,
  type MediaCoverageOverview,
} from './media/daf-media-coverage.service';

/**
 * Media bo'limi — yasalgan kontentni KO'RSATADI, yaratmaydi.
 * Yozish imkoniyati studiya qurilganda qo'shiladi.
 */
@Controller('daf/media')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class DafMediaController {
  constructor(
    private readonly service: DafMediaOverviewService,
    private readonly coverageService: DafMediaCoverageService,
  ) {}

  @Get('overview')
  overview(): MediaOverview {
    return this.service.overview();
  }

  /**
   * Eski `overview()`dan farqi: bu qo'lda yozilgan manifestni emas, bevosita
   * `Daf*` kontent jadvallarini o'qiydi — shuning uchun yangi audio/rasm
   * kaliti yozilganda sahifa QAYTA ISHLASHSIZ yangilanadi.
   */
  @Get('coverage')
  coverage(): Promise<MediaCoverageOverview> {
    return this.coverageService.coverage();
  }
}
