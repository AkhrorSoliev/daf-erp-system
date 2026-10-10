import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Injectable } from '@nestjs/common';
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
  quickRefund(dto: QuickRefundDto, userId: number, companyId: number) {
    return this.createService.quickRefund(dto, userId, companyId);
  }

  // Reverse
  reverse(
    id: string,
    params: { reason?: string; performedById: number; companyId: number },
  ) {
    return this.processService.reverse(id, params);
  }

  // Eligibility / list
  previewRefund(studentId: number, companyId: number, enrollmentId?: string) {
    return this.eligibility.previewRefund(studentId, companyId, enrollmentId);
  }
  findAll(companyId: number, branchIds: ReportBranchIds) {
    return this.eligibility.findAll(companyId, branchIds);
  }
}
