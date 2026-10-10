import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BalanceNoticeChannel,
  SmsMessageStatus,
  SmsMessageType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayWriteForStudent } from '../common/auth/financial-write-scope';
import { EntityHistoryService } from '../common/entity-history';
import { SmsService } from '../sms/sms.service';
import { loadNoticeText } from './load-transfer-state';
import type { CreateBalanceNoticeDto } from './dto/create-balance-notice.dto';

export const NO_TELEGRAM_MESSAGE = "Telegram bog'lanmagan — qo'ng'iroq qiling";
export const NO_BRANCH_PHONE_MESSAGE = 'Filial telefon raqami kiritilmagan';
export const NO_BALANCE_MESSAGE = "O'quvchi hisobida pul yo'q";

@Injectable()
export class BalanceNoticesService {
  constructor(
    private prisma: PrismaService,
    private sms: SmsService,
    private history: EntityHistoryService,
  ) {}

  /**
   * «Xabar berish» (ADR-0075). BOT: the pinned text goes out at once through
   * the student's SMS log; only a delivered message writes the notice. CALL:
   * the staff member called and marks it. Either starts the transfer clock.
   */
  async create(
    studentId: number,
    dto: CreateBalanceNoticeDto,
    userId: number,
    companyId: number,
  ) {
    const branchId = await assertCallerMayWriteForStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { firstName: true, balance: true, telegramChatId: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");
    if (student.balance <= 0) throw new BadRequestException(NO_BALANCE_MESSAGE);

    const note = dto.note || null;
    let smsMessageId: string | null = null;
    if (dto.channel === BalanceNoticeChannel.BOT) {
      if (!student.telegramChatId) {
        throw new BadRequestException(NO_TELEGRAM_MESSAGE);
      }
      const text = await loadNoticeText(
        this.prisma,
        {
          firstName: student.firstName,
          balance: student.balance,
          branchId,
          companyId,
        },
        new Date(),
      );
      if (!text) throw new BadRequestException(NO_BRANCH_PHONE_MESSAGE);
      const sent = await this.sms.sendToStudent(
        studentId,
        text,
        SmsMessageType.AUTO,
        userId,
        companyId,
        { assertCallerBranch: true },
      );
      if (sent.status !== SmsMessageStatus.SENT) {
        throw new BadRequestException(sent.errorMessage ?? 'Xabar yuborilmadi');
      }
      smsMessageId = sent.id;
    }

    const notice = await this.prisma.balanceNotice.create({
      data: {
        studentId,
        companyId,
        channel: dto.channel,
        amount: student.balance,
        note,
        smsMessageId,
        createdById: userId,
      },
    });
    await this.history.recordStatusChange({
      entityType: 'Student',
      entityId: studentId,
      oldValues: {},
      newValues: {
        status: 'PUL_HAQIDA_XABAR_BERILDI',
        kanal:
          dto.channel === BalanceNoticeChannel.BOT
            ? 'Telegram bot'
            : "Qo'ng'iroq",
        summa: student.balance,
        izoh: note,
      },
      changedById: userId,
      companyId,
    });
    return notice;
  }
}
