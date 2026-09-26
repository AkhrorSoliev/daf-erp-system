import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { presentStatement } from './present-statement';
import { StatementService, statementFilename } from './statement.service';

export function sendPdfAttachment(
  res: Response,
  buffer: Buffer,
  filename: string,
): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}

/**
 * The payment statement on the student profile's To'lovlar tab. Same roles
 * as the tab; the student's own branch is checked against the caller, like
 * every other profile read (`assertCallerMayTouchStudent`).
 */
@Controller('students')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class StatementsController {
  constructor(
    private readonly statements: StatementService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':id/statement')
  async getStatement(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);
    const model = await this.statements.build(id, companyId);
    return { model, view: presentStatement(model, 'admin') };
  }

  @Get(':id/statement.pdf')
  async getStatementPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @Res() res: Response,
  ) {
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);
    const { buffer, model } = await this.statements.pdf(id, companyId);
    sendPdfAttachment(res, buffer, statementFilename(model, true));
  }
}
