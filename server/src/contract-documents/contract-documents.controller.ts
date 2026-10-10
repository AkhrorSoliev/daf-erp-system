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
import { Can } from '../common/permissions/access.decorators';
import { ContractDocumentsService } from './contract-documents.service';
import { ContractLifecycleService } from './contract-lifecycle.service';
import {
  CancelContractDocumentDto,
  CreateContractDocumentDto,
  StudentContractsQueryDto,
  UpdateContractDocumentDto,
} from './dto/contract-document.dto';

/**
 * Student contracts (ADR-0075). Reads are a profile tab (`students.details`),
 * writes are `students.manage`; every route checks the student's branch in
 * the service (`assertCallerMayTouchStudent`).
 */
@Controller('contract-documents')
export class ContractDocumentsController {
  constructor(
    private readonly documents: ContractDocumentsService,
    private readonly lifecycle: ContractLifecycleService,
  ) {}

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
  @Can('students.manage')
  create(
    @Body() dto: CreateContractDocumentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.documents.create(dto, companyId, userId);
  }

  @Patch(':id')
  @Can('students.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDocumentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.lifecycle.update(id, dto, companyId, userId);
  }

  @Post(':id/sign')
  @Can('students.manage')
  sign(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.lifecycle.sign(id, companyId, userId);
  }

  @Post(':id/cancel')
  @Can('students.manage')
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
