import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators';
import { AnyStaff, Can } from '../common/permissions/access.decorators';
import { clausesFromTemplate } from './contract-clauses';
import { ContractDocumentsService } from './contract-documents.service';
import { ContractLifecycleService } from './contract-lifecycle.service';
import {
  CancelContractDocumentDto,
  ClausesQueryDto,
  CreateContractDocumentDto,
  StudentContractsQueryDto,
  UpdateContractDocumentDto,
} from './dto/contract-document.dto';

/**
 * Student contracts (ADR-0075). Reads are a profile tab (`students.details`),
 * writes are «Shartnoma tuzish va imzolash» (`contracts.manage`, ADR-0087);
 * every route checks the student's branch in the service
 * (`assertCallerMayTouchStudent`). Cancelling a SIGNED contract stays
 * CEO-only inside `ContractLifecycleService.cancel` (ADR-0075).
 */
@Controller('contract-documents')
export class ContractDocumentsController {
  constructor(
    private readonly documents: ContractDocumentsService,
    private readonly lifecycle: ContractLifecycleService,
  ) {}

  /**
   * Shartnoma bandlarining to'liq matni (ADR-0142): admin ekranlaridagi
   * «Shartnoma 3.2» havolasi uchun. Matn shartnoma shablonining o'zi, har
   * mijoz imzolaydigan umumiy matn, shuning uchun hamma xodimga ochiq.
   * `:id` marshrutlaridan oldin turishi shart.
   */
  @Get('clauses')
  @AnyStaff()
  clauses(@Query() query: ClausesQueryDto) {
    return clausesFromTemplate(query.nos);
  }

  @Get()
  @Can('students.details')
  list(
    @Query() query: StudentContractsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.documents.list(query.studentId, companyId, userId);
  }

  @Get('prefill')
  @Can('students.details')
  prefill(
    @Query() query: StudentContractsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.documents.prefill(query.studentId, companyId, userId);
  }

  @Post()
  @Can('contracts.manage')
  create(
    @Body() dto: CreateContractDocumentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.documents.create(dto, companyId, userId);
  }

  @Patch(':id')
  @Can('contracts.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDocumentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.lifecycle.update(id, dto, companyId, userId);
  }

  @Post(':id/sign')
  @Can('contracts.manage')
  sign(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.lifecycle.sign(id, companyId, userId);
  }

  @Post(':id/cancel')
  @Can('contracts.manage')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelContractDocumentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.lifecycle.cancel(id, dto.reason, companyId, userId);
  }

  @Get(':id/pdf')
  @Can('students.details')
  async pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.lifecycle.pdf(
      id,
      companyId,
      userId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
