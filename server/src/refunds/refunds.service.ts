import { Injectable } from '@nestjs/common';
import { CreateRefundDto } from './dto/create-refund.dto';
import { ProcessRefundDto } from './dto/process-refund.dto';
import { QuickRefundDto } from './dto/quick-refund.dto';
import { RefundsCreateService } from './refunds-create.service';
import { RefundsProcessService } from './refunds-process.service';
import { RefundsEligibilityService } from './refunds-eligibility.service';

@Injectable()
export class RefundsService {
  constructor(
    private createService: RefundsCreateService,
    private processService: RefundsProcessService,
    private eligibility: RefundsEligibilityService,
  ) {}

  // Create
  create(dto: CreateRefundDto, userId: number, companyId: number) {
    return this.createService.create(dto, userId, companyId);
  }
  quickRefund(dto: QuickRefundDto, userId: number, companyId: number) {
    return this.createService.quickRefund(dto, userId, companyId);
  }

  // Process / reverse
  process(
    id: string,
    dto: ProcessRefundDto,
    userId: number,
    companyId: number,
  ) {
    return this.processService.process(id, dto, userId, companyId);
  }
  reverse(
    id: string,
    params: { reason?: string; performedById: number; companyId: number },
  ) {
    return this.processService.reverse(id, params);
  }

  // Eligibility / list
  previewRefund(studentId: number, companyId: number) {
    return this.eligibility.previewRefund(studentId, companyId);
  }
  findAll(companyId: number) {
    return this.eligibility.findAll(companyId);
  }
}
