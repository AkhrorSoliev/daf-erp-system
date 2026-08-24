import { Injectable } from '@nestjs/common';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { ChangeStudentStatusDto } from './dto/change-student-status.dto';
import { StudentsReadService } from './students-read.service';
import { StudentsWriteService } from './students-write.service';
import { StudentsStatusService } from './students-status.service';
import { TransactionsService } from '../transactions/transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportBranchIds } from '../common/finance/report-branch-scope';
import { assertCallerMayWriteForStudent } from '../common/auth/financial-write-scope';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';

@Injectable()
export class StudentsService {
  constructor(
    private read: StudentsReadService,
    private write: StudentsWriteService,
    private statusService: StudentsStatusService,
    private transactions: TransactionsService,
    // Holds the branch-ownership checks below; this facade otherwise
    // delegates rather than querying.
    private prisma: PrismaService,
  ) {}

  // Reads
  findAll(
    query: StudentQueryDto,
    companyId: number,
    branchScope: ReportBranchIds,
  ) {
    return this.read.findAll(query, companyId, branchScope);
  }
  findById(id: number, companyId: number, branchScope: ReportBranchIds) {
    return this.read.findById(id, companyId, branchScope);
  }
  /**
   * The id-addressed profile reads.
   *
   * `findAll` / `findById` take a `ReportBranchIds` scope, so the LIST is
   * confined — but every tab on the profile behind it was `companyId`-only.
   * A Namangan director who typed a Fargona student's id into the URL got the
   * balance, the ledger summary, the lesson history, the SMS log and the status
   * trail in full. The list they could not see; the profile they could.
   *
   * These take the caller's id rather than a scope because they answer a
   * question about ONE student: the gate is "may you reach this record", and
   * once you may, you see it whole. A scope predicate would silently return an
   * empty tab instead of a refusal, which reads as "nothing here" — a worse
   * answer than "not yours".
   */
  async getStatusHistory(id: number, companyId: number, userId?: number) {
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);
    return this.read.getStatusHistory(id, companyId);
  }
  async getActiveEnrollmentsWithPrepaid(
    id: number,
    companyId: number,
    userId?: number,
  ) {
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);
    return this.read.getActiveEnrollmentsWithPrepaid(id, companyId);
  }
  async getClosedEnrollments(id: number, companyId: number, userId?: number) {
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);
    return this.read.getClosedEnrollments(id, companyId);
  }
  async getLessonsOverview(
    id: number,
    companyId: number,
    includeClosed?: boolean,
    userId?: number,
  ) {
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);
    return this.read.getLessonsOverview(id, companyId, includeClosed);
  }
  /**
   * One-shot opening balance for a student migrating from the old system.
   *
   * Routed through the service (the controller used to call
   * `TransactionsService.recordInitialBalance` directly) so the branch
   * ownership check has somewhere to live: this writes an `INITIAL_BALANCE`
   * ledger row, which is money.
   */
  async setInitialBalance(
    id: number,
    dto: { amount: number; note?: string },
    userId: number,
    companyId: number,
  ) {
    await assertCallerMayWriteForStudent(this.prisma, userId, id, companyId);
    return this.transactions.recordInitialBalance({
      studentId: id,
      amount: dto.amount,
      note: dto.note,
      companyId,
      performedById: userId,
    });
  }

  async getBalanceSummary(id: number, companyId: number, userId?: number) {
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);
    return this.transactions.getBalanceSummary(id, companyId);
  }

  // Writes
  create(dto: CreateStudentDto, companyId: number, userId?: number) {
    return this.write.create(dto, companyId, userId);
  }
  update(
    id: number,
    dto: UpdateStudentDto,
    userId: number | undefined,
    companyId: number,
  ) {
    return this.write.update(id, dto, userId, companyId);
  }
  delete(id: number, deletedById: number, reason: string, companyId: number) {
    return this.write.delete(id, deletedById, reason, companyId);
  }
  createStudentUser(
    studentId: number,
    phone: string,
    firstName: string,
    lastName: string,
    companyId: number,
  ) {
    return this.write.createStudentUser(
      studentId,
      phone,
      firstName,
      lastName,
      companyId,
    );
  }

  // Status
  changeStatus(
    id: number,
    dto: ChangeStudentStatusDto,
    userId: number,
    companyId: number,
  ) {
    return this.statusService.changeStatus(id, dto, userId, companyId);
  }
}
