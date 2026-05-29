import { Injectable } from '@nestjs/common';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { ChangeStudentStatusDto } from './dto/change-student-status.dto';
import { StudentsReadService } from './students-read.service';
import { StudentsWriteService } from './students-write.service';
import { StudentsStatusService } from './students-status.service';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class StudentsService {
  constructor(
    private read: StudentsReadService,
    private write: StudentsWriteService,
    private statusService: StudentsStatusService,
    private transactions: TransactionsService,
  ) {}

  // Reads
  findAll(query: StudentQueryDto, companyId: number) {
    return this.read.findAll(query, companyId);
  }
  findById(id: number, companyId: number) {
    return this.read.findById(id, companyId);
  }
  getStatusHistory(id: number, companyId: number) {
    return this.read.getStatusHistory(id, companyId);
  }
  getActiveEnrollmentsWithPrepaid(id: number, companyId: number) {
    return this.read.getActiveEnrollmentsWithPrepaid(id, companyId);
  }
  getClosedEnrollments(id: number, companyId: number) {
    return this.read.getClosedEnrollments(id, companyId);
  }
  getBalanceSummary(id: number, companyId: number) {
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
