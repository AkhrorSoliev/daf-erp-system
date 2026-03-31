import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SmsService } from './sms.service';
import {
  buildEnrollmentMessage,
  buildRemovalMessage,
  EnrollmentMessagePayload,
  RemovalMessagePayload,
} from './sms-templates';

export interface StudentEnrolledEvent extends EnrollmentMessagePayload {
  studentId: number;
  companyId: number | null;
}

export interface StudentRemovedEvent extends RemovalMessagePayload {
  studentId: number;
  companyId: number | null;
}

@Injectable()
export class SmsEventsListener {
  private readonly logger = new Logger(SmsEventsListener.name);

  constructor(private readonly smsService: SmsService) {}

  @OnEvent('student.enrolled')
  async handleStudentEnrolled(payload: StudentEnrolledEvent) {
    try {
      const message = buildEnrollmentMessage(payload);
      await this.smsService.sendToStudent(
        payload.studentId,
        message,
        'AUTO',
        undefined,
        payload.companyId ?? undefined,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send enrollment SMS to student ${payload.studentId}: ${error.message}`,
      );
    }
  }

  @OnEvent('student.removed_from_group')
  async handleStudentRemoved(payload: StudentRemovedEvent) {
    try {
      const message = buildRemovalMessage(payload);
      await this.smsService.sendToStudent(
        payload.studentId,
        message,
        'AUTO',
        undefined,
        payload.companyId ?? undefined,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send removal SMS to student ${payload.studentId}: ${error.message}`,
      );
    }
  }
}
