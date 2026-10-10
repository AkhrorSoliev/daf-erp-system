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
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { ContractDocumentsService } from './contract-documents.service';
import { ContractLifecycleService } from './contract-lifecycle.service';
import {
  CancelContractDocumentDto,
  CreateContractDocumentDto,
  StudentContractsQueryDto,
  UpdateContractDocumentDto,
} from './dto/contract-document.dto';

/**
 * Student contracts (ADR-0075). The roles of the student profile's tabs;
 * every route checks the student's branch in the service
 * (`assertCallerMayTouchStudent`).
 */
@Controller('contract-documents')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class ContractDocumentsController {
  constructor(
    private readonly documents: ContractDocumentsService,
    private readonly lifecycle: ContractLifecycleService,
  ) {}

  @Get()
  list(
    @Query() query: StudentContractsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.documents.list(query.studentId, companyId, userId);
  }

  @Get('prefill')
  prefill(
    @Query() query: StudentContractsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.documents.prefill(query.studentId, companyId, userId);
  }

  @Post()
  create(
    @Body() dto: CreateContractDocumentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.documents.create(dto, companyId, userId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDocumentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.lifecycle.update(id, dto, companyId, userId);
  }

  @Post(':id/sign')
  sign(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.lifecycle.sign(id, companyId, userId);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelContractDocumentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.lifecycle.cancel(id, dto.reason, companyId, userId);
  }

  @Get(':id/pdf')
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
