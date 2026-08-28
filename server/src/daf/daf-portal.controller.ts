import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { DafPortalReadService } from './daf-portal-read.service';
import { DafAttemptService } from './daf-attempt.service';
import { CheckDrillDto, CreateAttemptDto } from './dto/create-attempt.dto';
import { DafDrillService } from './lesson/daf-drill.service';

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
  ) {}

  @Get('levels')
  getLevels() {
    return this.read.getLevels();
  }

  @Get('units/:id')
  getUnit(@Param('id', ParseIntPipe) id: number) {
    return this.read.getUnit(id);
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
}
