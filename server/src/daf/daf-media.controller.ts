import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
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
import {
  DafMediaInhaltService,
  type SectionInhalt,
} from './media/daf-media-inhalt.service';
import {
  DafMediaFragenService,
  type VorschauFrage,
} from './media/daf-media-fragen.service';

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
    private readonly inhaltService: DafMediaInhaltService,
    private readonly fragenService: DafMediaFragenService,
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

  /**
   * Bitta bo'limning to'liq materiali — «nechta» emas, «nima» savoliga
   * javob. `coverage()` sonlarni beradi, bu yo'l o'sha sonlar ortidagi
   * so'z/gap/ibora/dialogni o'zini qaytaradi (audio manzillari bilan).
   */
  @Get('sections/:id/inhalt')
  inhalt(@Param('id', ParseIntPipe) id: number): Promise<SectionInhalt> {
    return this.inhaltService.inhalt(id);
  }

  /**
   * Bo'lim materialidan quriladigan BARCHA savollar — javobi bilan.
   *
   * Savollar bazada saqlanmaydi (dizayn D7, `frage.types.ts`): dvigatel
   * ularni har so'rovda materialdan qayta quradi, shuning uchun bu yo'l
   * ham xuddi shu 12 quruvchini ishlatadi (`DafMediaFragenService`), o'z
   * nusxasini yozmaydi. Studentga bog'liq emas — `studentId` yo'q, chunki
   * bitta seansga tegadigan o'n ikkitasi emas, qurilishi mumkin bo'lgan
   * HAMMASI qaytadi.
   */
  @Get('sections/:id/fragen')
  fragen(@Param('id', ParseIntPipe) id: number): Promise<VorschauFrage[]> {
    return this.fragenService.fragen(id);
  }
}
