import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators';
import { StudentCardGuard } from '../common/guards';
import { StudentOnly } from '../common/permissions/access.decorators';
import { StatementService, statementFilename } from './statement.service';
import { sendPdfAttachment } from './statements.controller';

/**
 * The student's own payment statement. `StudentCardGuard` refuses a token
 * with no `studentId` (404) before the handler runs.
 */
@Controller('student-portal')
@UseGuards(StudentCardGuard)
@StudentOnly()
export class StatementPortalController {
  constructor(private readonly statements: StatementService) {}

  @Get('statement.pdf')
  async myStatementPdf(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
    @Res() res: Response,
  ) {
    const { buffer, model } = await this.statements.pdf(studentId, companyId);
    sendPdfAttachment(res, buffer, statementFilename(model));
  }
}
