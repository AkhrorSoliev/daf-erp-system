import { Injectable } from '@nestjs/common';
import { QrAttendanceSessionService } from './qr-attendance-session.service';
import { QrAttendanceScanService } from './qr-attendance-scan.service';

@Injectable()
export class QrAttendanceService {
  constructor(
    private session: QrAttendanceSessionService,
    private scanService: QrAttendanceScanService,
  ) {}

  startSession(
    groupId: string,
    date: string,
    teacherId: number,
    companyId: number,
    roles?: string[],
  ) {
    return this.session.startSession(
      groupId,
      date,
      teacherId,
      companyId,
      roles,
    );
  }

  rotateToken(
    groupId: string,
    date: string,
    sessionId: string,
    teacherId: number,
  ) {
    return this.session.rotateToken(groupId, date, sessionId, teacherId);
  }

  stopSession(
    groupId: string,
    date: string,
    sessionId: string,
    teacherId: number,
  ) {
    return this.session.stopSession(groupId, date, sessionId, teacherId);
  }

  scanQr(token: string, studentId: number, userId: number, companyId: number) {
    return this.scanService.scanQr(token, studentId, userId, companyId);
  }
}
