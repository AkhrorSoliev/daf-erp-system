import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { StudentPortalService } from './student-portal.service';
import { QrAttendanceService } from '../attendance/qr-attendance.service';
import { ChangePortalPasswordDto } from './dto/change-portal-password.dto';
import { UpdatePortalNameDto } from './dto/update-portal-name.dto';
import { InitPaymentDto } from './dto/init-payment.dto';
import { ScanQrDto } from '../attendance/dto/qr-session.dto';
import { Roles, CurrentUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('student-portal')
export class StudentPortalController {
  constructor(
    private studentPortalService: StudentPortalService,
    private qrAttendanceService: QrAttendanceService,
    private config: ConfigService,
  ) {}

  @Get('profile')
  @UseGuards(RolesGuard)
  @Roles('Student')
  getProfile(@CurrentUser('studentId') studentId: number) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.studentPortalService.getProfile(studentId);
  }

  @Get('schedule')
  @UseGuards(RolesGuard)
  @Roles('Student')
  getSchedule(@CurrentUser('studentId') studentId: number) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.studentPortalService.getSchedule(studentId);
  }

  @Get('attendance/stats')
  @UseGuards(RolesGuard)
  @Roles('Student')
  getAttendanceStats(@CurrentUser('studentId') studentId: number) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.studentPortalService.getAttendanceStats(studentId);
  }

  @Get('attendance/history')
  @UseGuards(RolesGuard)
  @Roles('Student')
  getAttendanceHistory(@CurrentUser('studentId') studentId: number) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.studentPortalService.getAttendanceHistory(studentId);
  }

  @Patch('name')
  @UseGuards(RolesGuard)
  @Roles('Student')
  updateName(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: UpdatePortalNameDto,
  ) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.studentPortalService.updateName(studentId, dto, userId);
  }

  @Patch('password')
  @UseGuards(RolesGuard)
  @Roles('Student')
  changePassword(
    @CurrentUser('id') userId: number,
    @CurrentUser('studentId') studentId: number,
    @Body() dto: ChangePortalPasswordDto,
  ) {
    return this.studentPortalService.changePassword(userId, studentId, dto);
  }

  @Post('photo')
  @UseGuards(RolesGuard)
  @Roles('Student')
  @UseInterceptors(FileInterceptor('file'))
  updatePhoto(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.studentPortalService.updatePhoto(studentId, file, userId);
  }

  @Get('payments')
  @UseGuards(RolesGuard)
  @Roles('Student')
  getPayments(@CurrentUser('studentId') studentId: number) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.studentPortalService.getPaymentHistory(studentId);
  }

  /**
   * Generate a Payme checkout URL for the student to pay online.
   * Returns the checkout URL — the frontend redirects the student there.
   */
  @Post('payments/init')
  @UseGuards(RolesGuard)
  @Roles('Student')
  initPayment(
    @CurrentUser('studentId') studentId: number,
    @Body() dto: InitPaymentDto,
  ) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');

    if (dto.method !== 'PAYME') {
      throw new BadRequestException(
        "Hozirda faqat Payme orqali to'lov qilish mumkin",
      );
    }

    const merchantId = this.config.get<string>('PAYME_MERCHANT_ID');
    if (!merchantId) {
      throw new BadRequestException("To'lov tizimi sozlanmagan");
    }

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const checkoutBase = isProduction
      ? 'https://checkout.paycom.uz'
      : 'https://test.paycom.uz';

    const params = Buffer.from(
      JSON.stringify({
        m: merchantId,
        ac: { student_id: studentId },
        a: dto.amount * 100, // so'm → tiyin
        l: 'uz',
        c: dto.returnUrl || 'https://student.dafzentrum.uz/payment/result',
      }),
    ).toString('base64');

    return { checkoutUrl: `${checkoutBase}/${params}` };
  }

  @Post('attendance/scan')
  @UseGuards(RolesGuard)
  @Roles('Student')
  scanQr(
    @Body() dto: ScanQrDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.qrAttendanceService.scanQr(
      dto.token,
      studentId,
      userId,
      companyId,
    );
  }
}
