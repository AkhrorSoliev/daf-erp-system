import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { DafPortalReadService } from './daf-portal-read.service';
import { DafAttemptService } from './daf-attempt.service';
import { CheckDrillDto, CreateAttemptDto } from './dto/create-attempt.dto';
import {
  AbschlussDto,
  CheckAntwortDto,
  ErsatzQueryDto,
} from './dto/uebung.dto';
import { DafDrillService } from './lesson/daf-drill.service';
import { UebungService } from './uebung/uebung.service';
import {
  FortschrittService,
  ReytingQamrovi,
} from './fortschritt/fortschritt.service';

/**
 * O'quvchi portalining o'quv bo'limi.
 *
 * Guard shart, garchi kontent maxfiy bo'lmasa ham: global `JwtAuthGuard`
 * faqat kirganini isbotlaydi, va boshqa portal tokeni ham haqiqiy token.
 * Urinish yozish esa o'quvchining natijasiga tegadi.
 */
@Controller('student-portal/lernen')
@UseGuards(RolesGuard)
@Roles('Student')
export class DafPortalController {
  constructor(
    private readonly read: DafPortalReadService,
    private readonly attempts: DafAttemptService,
    private readonly drills: DafDrillService,
    private readonly uebung: UebungService,
    private readonly fortschritt: FortschrittService,
  ) {}

  /**
   * `studentId` TOKENDAN olinadi: javob endi shu o'quvchining
   * ilgarilashiga (`doneCount`) bog'liq, boshqasining tanasidan yoki
   * so'rov parametridan olinsa, birov boshqaning natijasini ko'rishi
   * mumkin bo'lardi.
   */
  @Get('levels')
  getLevels(@CurrentUser('studentId') studentId: number) {
    return this.read.getLevels(studentId);
  }

  /** Xuddi shu sabab: javobga har darsning ilgarilashi (`completedAt`/`bestScore`/`runs`) qo'shiladi. */
  @Get('units/:id')
  getUnit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('studentId') studentId: number,
  ) {
    return this.read.getUnit(id, studentId);
  }

  @Get('lessons/:id')
  getLesson(@Param('id', ParseIntPipe) id: number) {
    return this.read.getLesson(id);
  }

  /**
   * Grammatika mavzulari ro'yxati. Yo'lga tushmagan 34 sahifa faqat shu
   * yerdan ochiladi — ularsiz mashqlarning 39 % i ko'rinmay qolardi.
   */
  @Get('grammar')
  getGrammar() {
    return this.read.getGrammarIndex();
  }

  /** Darsning lug'at mashqlari — javobsiz. */
  @Get('lessons/:id/drill')
  getDrill(@Param('id', ParseIntPipe) id: number) {
    return this.drills.getDrill(id);
  }

  /**
   * Lug'at mashqiga javob. Tekshiruv SERVERDA: savol qayta tug'iladi va
   * berilgan tanlov solishtiriladi. Mijoz to'g'ri javobni bilmaydi.
   */
  @Post('drill/check')
  checkDrill(
    @Body() dto: CheckDrillDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.attempts.recordDrill(dto, { studentId, companyId });
  }

  /**
   * `studentId` TOKENDAN olinadi, tanadan emas — aks holda o'quvchi
   * boshqasining nomidan urinish yozib, uning natijasini buzishi mumkin
   * bo'lardi.
   */
  @Post('attempts')
  recordAttempt(
    @Body() dto: CreateAttemptDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.attempts.record(dto, { studentId, companyId });
  }

  /** Darsning 12 savoli. To'g'ri javoblar ichida YO'Q. */
  @Get('lessons/:id/uebung')
  getUebung(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('studentId') studentId: number,
  ) {
    return this.uebung.seans(id, studentId);
  }

  /**
   * Mashq javobi. `studentId` TOKENDAN olinadi, tanadan emas — aks holda
   * o'quvchi boshqasining nomidan javob yozib, uning natijasini buzishi
   * mumkin bo'lardi.
   */
  @Post('uebung/check')
  checkUebung(
    @Body() dto: CheckAntwortDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.uebung.pruefen(dto, { studentId, companyId });
  }

  /**
   * Noto'g'ri javob berilgan material haqida boshqa formatda savol.
   * Kurs kontenti kabi filialga bog'liq emas, lekin savolning o'zi
   * SHU o'quvchining Leitner holatiga qarab quriladi — shuning uchun
   * `studentId` tokendan kerak (kirish huquqiga emas, savol tarkibiga).
   */
  @Get('lessons/:id/uebung/ersatz')
  getErsatz(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ErsatzQueryDto,
    @CurrentUser('studentId') studentId: number,
  ) {
    return this.uebung.ersatz(
      id,
      studentId,
      query.itemType,
      query.itemId,
      query.nichtFormat,
    );
  }

  /**
   * Seans tugaganini yozadi. `studentId` TOKENDAN olinadi, tanadan emas —
   * aks holda o'quvchi boshqasining nomidan yakun yozib, uning
   * ilgarilashini buzishi mumkin bo'lardi.
   */
  @Post('lessons/:id/abschluss')
  postAbschluss(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AbschlussDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.uebung.abschluss(id, dto, { studentId, companyId });
  }

  /**
   * O'quvchining o'z ilgarilashi: umumiy ball, daraja, seriya, haftalik
   * ball va o'rin. `studentId` TOKENDAN olinadi — bu javob shu
   * o'quvchining shaxsiy ko'rsatkichi, so'rov parametridan olinsa birov
   * boshqasining natijasini ko'rishi mumkin bo'lardi.
   */
  @Get('fortschritt')
  getFortschritt(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.fortschritt.uebersicht(studentId, companyId);
  }

  /**
   * Haftalik reyting jadvali. `scope=gruppe` — o'quvchining o'z guruhi,
   * `scope=zentrum` — butun markaz (filialga cheklanmagani sababi
   * `fortschritt.service.ts`dagi izohda va `branch-route-policy.ts`da
   * yozilgan). Boshqa qiymat qabul qilinmaydi.
   */
  @Get('reyting')
  getReyting(
    @Query('scope') scope: string,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    if (scope !== 'gruppe' && scope !== 'zentrum') {
      throw new BadRequestException(
        "scope faqat 'gruppe' yoki 'zentrum' bo'lishi mumkin",
      );
    }
    return this.fortschritt.reyting(
      studentId,
      companyId,
      scope as ReytingQamrovi,
    );
  }
}
