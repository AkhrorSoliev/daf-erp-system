import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ALLOWED_IMAGE_MIMES,
  MAX_UPLOAD_BYTES,
  UPLOAD_TYPE_MESSAGE,
} from '../upload/upload.constraints';
import { StudentPortalService } from './student-portal.service';
import { QrAttendanceService } from '../attendance/qr-attendance.service';
import { GatewayConfigService } from '../payment-gateways/gateway-config.service';
import { ChangePortalPasswordDto } from './dto/change-portal-password.dto';
import { UpdatePortalNameDto } from './dto/update-portal-name.dto';
import { InitPaymentDto } from './dto/init-payment.dto';
import { ScanQrDto } from '../attendance/dto/qr-session.dto';
import { Roles, CurrentUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { PaymentMethod } from '@prisma/client';

@Controller('student-portal')
export class StudentPortalController {
  constructor(
    private studentPortalService: StudentPortalService,
    private qrAttendanceService: QrAttendanceService,
    private config: ConfigService,
    private gatewayConfig: GatewayConfigService,
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

  // Same multer limits as `POST /upload`. This route had `FileInterceptor`
  // with no options, so any size and any type reached the service — and the
  // service is what writes into the public bucket. `UploadService` now
  // rejects both regardless; these options just stop a large body from being
  // buffered before that happens.
  @Post('photo')
  @UseGuards(RolesGuard)
  @Roles('Student')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
          return cb(new BadRequestException(UPLOAD_TYPE_MESSAGE), false);
        }
        cb(null, true);
      },
    }),
  )
  updatePhoto(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.studentPortalService.updatePhoto(studentId, file, userId);
  }

  @Delete('photo')
  @UseGuards(RolesGuard)
  @Roles('Student')
  removePhoto(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
  ) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.studentPortalService.removePhoto(studentId, userId);
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
  async initPayment(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
    @Body() dto: InitPaymentDto,
  ) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');

    const returnUrl =
      dto.returnUrl || 'https://student.dafzentrum.uz/portal/payments/result';

    // Record payment intent so webhook can verify expected amount
    const provider =
      dto.method === 'PAYME' ? PaymentMethod.PAYME : PaymentMethod.CLICK;
    await this.studentPortalService.createPaymentIntent({
      studentId,
      companyId,
      provider,
      amountSom: dto.amount,
    });

    // ─── Payme ─────────────────────────────────────────────────
    if (dto.method === 'PAYME') {
      const cfg = await this.gatewayConfig.getConfig(
        companyId,
        PaymentMethod.PAYME,
      );
      if (!cfg) {
        throw new BadRequestException("To'lov tizimi sozlanmagan");
      }

      const isProduction = this.config.get<string>('NODE_ENV') === 'production';
      const checkoutBase = isProduction
        ? 'https://checkout.paycom.uz'
        : 'https://test.paycom.uz';
      const amountTiyin = dto.amount * 100; // so'm → tiyin

      // Payme expects semicolon-separated params, NOT JSON
      // Format: m=MERCHANT_ID;ac.FIELD=VALUE;a=AMOUNT;c=RETURN_URL
      let paramStr = `m=${cfg.merchantId};ac.student_id=${studentId};a=${amountTiyin};l=uz`;

      // Only include callback if not localhost (Payme rejects localhost)
      if (returnUrl && !returnUrl.includes('localhost')) {
        paramStr += `;c=${returnUrl}`;
      }

      const params = Buffer.from(paramStr).toString('base64');

      return { checkoutUrl: `${checkoutBase}/${params}` };
    }

    // ─── Click ─────────────────────────────────────────────────
    if (dto.method === 'CLICK') {
      const cfg = await this.gatewayConfig.getConfig(
        companyId,
        PaymentMethod.CLICK,
      );
      if (!cfg) {
        throw new BadRequestException("Click to'lov tizimi sozlanmagan");
      }

      // For Click, merchantId stores merchant_id and secretKey stores service_id in env fallback
      const clickServiceId =
        this.config.get<string>('CLICK_SERVICE_ID') ?? cfg.secretKey;
      const clickMerchantId = cfg.merchantId;
      const clickMerchantUserId = this.config.get<string>(
        'CLICK_MERCHANT_USER_ID',
      );

      const params = [
        `service_id=${clickServiceId}`,
        `merchant_id=${clickMerchantId}`,
        `amount=${dto.amount}`,
        `transaction_param=${studentId}`,
        `return_url=${encodeURIComponent(returnUrl)}`,
      ];
      if (clickMerchantUserId) {
        params.push(`merchant_user_id=${clickMerchantUserId}`);
      }
      const checkoutUrl = `https://my.click.uz/services/pay?${params.join('&')}`;

      return { checkoutUrl };
    }

    throw new BadRequestException(
      "Hozirda faqat Payme va Click orqali to'lov qilish mumkin",
    );
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
