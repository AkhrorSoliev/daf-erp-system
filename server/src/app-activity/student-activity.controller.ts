import {
  Body,
  Controller,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { ActivityHeartbeatDto } from './dto/activity-heartbeat.dto';
import { AppActivityWriteService } from './app-activity-write.service';

/**
 * O'quvchi ilovasining faollik yuborishi (dizayn 4). `studentId` TOKENDAN —
 * DTO'da bunday maydon yo'q, begona seans servisda 403 bilan rad etiladi.
 */
@Controller('student-portal')
@UseGuards(RolesGuard)
@Roles('Student')
export class StudentActivityController {
  constructor(private readonly faollik: AppActivityWriteService) {}

  @Post('activity')
  heartbeat(
    @Body() dto: ActivityHeartbeatDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.faollik.heartbeat(dto, { studentId, companyId });
  }
}
