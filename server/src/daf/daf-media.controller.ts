import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Can } from '../common/permissions/access.decorators';
import {
  DafMediaOverviewService,
  type MediaOverview,
} from './media/daf-media-overview.service';
import {
  DafMediaCoverageService,
  type MediaCoverageOverview,
} from './media/daf-media-coverage.service';
import {
  DafMediaInhaltService,
  type SectionInhalt,
} from './media/daf-media-inhalt.service';
import {
  DafMediaFragenService,
  type LessonFragen,
} from './media/daf-media-fragen.service';
import { UebungService } from './uebung/uebung.service';
import { CheckAntwortDto, ErsatzQueryDto, JuftDto } from './dto/uebung.dto';

import {
  DafMediaJangService,
  type JangOverview,
} from './media/daf-media-jang.service';

/**
 * Media bo'limi — yasalgan kontentni KO'RSATADI, yaratmaydi.
 * Yozish imkoniyati studiya qurilganda qo'shiladi.
 */
@Controller('daf/media')
@Can('media.view')
export class DafMediaController {
  constructor(
    private readonly service: DafMediaOverviewService,
    private readonly coverageService: DafMediaCoverageService,
    private readonly inhaltService: DafMediaInhaltService,
    private readonly fragenService: DafMediaFragenService,
    private readonly jangService: DafMediaJangService,
    private readonly uebung: UebungService,
  ) {}

  /**
   * Jang savollarining barchasi (qoralama ham) — CEO ko'rib chiqib, nimani
   * o'zgartirishni aytishi uchun. Faqat o'qish; to'g'ri javob ATAYLAB bor —
   * bu admin sahifasi, `media.view` bilan yopilgan.
   */
  @Get('jang')
  jang(): Promise<JangOverview> {
    return this.jangService.jang();
  }

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

  /**
   * Bitta bo'limning to'liq materiali — «nechta» emas, «nima» savoliga
   * javob. `coverage()` sonlarni beradi, bu yo'l o'sha sonlar ortidagi
   * so'z/gap/ibora/dialogni o'zini qaytaradi (audio manzillari bilan).
   */
  @Get('sections/:id/inhalt')
  inhalt(@Param('id', ParseIntPipe) id: number): Promise<SectionInhalt> {
    return this.inhaltService.inhalt(id);
  }

  /** Seansdan chiqishi mumkin bo'lgan BARCHA savollar — to'g'ri javobi bilan. */
  @Get('lessons/:id/fragen')
  lessonFragen(@Param('id', ParseIntPipe) id: number): Promise<LessonFragen> {
    return this.fragenService.lessonFragen(id);
  }

  /**
   * «O'quvchi kabi o'tib ko'rish»: o'quvchi seansining o'zi, lekin
   * o'quvchisiz — `null` bilan hech narsa o'qilmaydi va yozilmaydi.
   */
  @Get('lessons/:id/sinov')
  sinov(@Param('id', ParseIntPipe) id: number) {
    return this.uebung.seans(id, null);
  }

  @Get('lessons/:id/sinov/ersatz')
  sinovErsatz(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ErsatzQueryDto,
  ) {
    return this.uebung.ersatz(
      id,
      null,
      query.itemType,
      query.itemId,
      query.nichtFormat,
    );
  }

  @Post('sinov/check')
  sinovCheck(@Body() dto: CheckAntwortDto) {
    return this.uebung.pruefen(dto, null);
  }

  @Post('sinov/juft')
  sinovJuft(@Body() dto: JuftDto) {
    return this.uebung.juft(dto, null);
  }
}
