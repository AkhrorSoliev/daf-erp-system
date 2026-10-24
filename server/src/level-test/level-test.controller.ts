import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';
import { LevelTestResultsService } from './level-test-results.service';

/**
 * O'quvchi profilidagi daraja testi natijalari (ADR-0122). Filial tekshiruvi
 * servis ichida (`assertCallerMayTouchStudent`): boshqa filial o'quvchisi — 403.
 */
@Controller('students/:id/level-tests')
export class StudentLevelTestsController {
  constructor(private readonly results: LevelTestResultsService) {}

  @Get()
  @Can('students.details')
  list(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.results.forStudent(userId, companyId, id);
  }
}
