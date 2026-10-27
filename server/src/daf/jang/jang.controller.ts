import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators';
import { StudentCardGuard } from '../../common/guards';
import { StudentOnly } from '../../common/permissions/access.decorators';
import { JangJavobDto } from '../dto/jang.dto';
import { JangService } from './jang.service';

/**
 * Jang (spec 2026-10-27). `DafPortalController` bilan bir xil himoya:
 * `studentId` faqat tokendan, boshqaning jangi 404.
 */
@Controller('student-portal/lernen/jang')
@UseGuards(StudentCardGuard)
@StudentOnly()
export class JangController {
  constructor(private readonly jang: JangService) {}

  @Get('holat')
  holat(@CurrentUser('studentId') studentId: number) {
    return this.jang.holat(studentId);
  }

  @Post('boshla')
  boshla(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.jang.boshla(studentId, companyId);
  }

  @Post(':id/javob')
  javob(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: JangJavobDto,
    @CurrentUser('studentId') studentId: number,
  ) {
    return this.jang.javob(studentId, id, dto);
  }

  @Post(':id/yakun')
  yakun(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.jang.yakun(studentId, companyId, id);
  }
}
