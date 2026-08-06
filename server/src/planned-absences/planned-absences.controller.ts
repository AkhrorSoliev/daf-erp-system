import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { PlannedAbsencesService } from './planned-absences.service';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpsertPlannedAbsenceDto } from './dto/upsert-planned-absence.dto';

@Controller('planned-absences')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class PlannedAbsencesController {
  constructor(private readonly plannedAbsences: PlannedAbsencesService) {}

  // Pre-mark (create-or-update) a single student for a not-yet-taken lesson.
  @Post(':groupId/date/:date')
  upsert(
    @Param('groupId') groupId: string,
    @Param('date') date: string,
    @Body() dto: UpsertPlannedAbsenceDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.plannedAbsences.upsert(
      groupId,
      date,
      dto,
      userId,
      roles,
      companyId,
    );
  }

  // Remove a not-yet-consumed pre-mark.
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.plannedAbsences.remove(id, userId, companyId, roles);
  }
}
