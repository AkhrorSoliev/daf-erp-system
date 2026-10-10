import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators';
import { StudentCardGuard } from '../../common/guards';
import { StudentOnly } from '../../common/permissions/access.decorators';
import { OwnPasswordAttemptGuard } from '../../common/guards/own-password-attempt.guard';
import { StudentExtraPhoneService } from './student-extra-phone.service';
import { ExtraPhoneSendCodeDto } from './dto/extra-phone-send-code.dto';
import { ExtraPhoneVerifyDto } from './dto/extra-phone-verify.dto';
import { ExtraPhoneRemoveDto } from './dto/extra-phone-remove.dto';

/**
 * The student's own backup number (ADR-0070). Every route is the caller's own
 * card: the id comes from the token, never from the request.
 */
@Controller('student-portal/extra-phone')
@UseGuards(StudentCardGuard)
@StudentOnly()
export class StudentExtraPhoneController {
  constructor(private readonly extraPhone: StudentExtraPhoneService) {}

  @Get()
  status(@CurrentUser('studentId') studentId: number) {
    return this.extraPhone.status(studentId);
  }

  /** Asks for the current password (ADR-0031), so it carries the attempt cap. */
  @Post('send-code')
  @HttpCode(200)
  @UseGuards(OwnPasswordAttemptGuard)
  sendCode(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: ExtraPhoneSendCodeDto,
  ) {
    return this.extraPhone.sendCode(
      studentId,
      userId,
      dto.phone,
      dto.currentPassword,
    );
  }

  @Post('verify')
  @HttpCode(200)
  verify(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: ExtraPhoneVerifyDto,
  ) {
    return this.extraPhone.verify(studentId, userId, dto.code);
  }

  @Post('remove')
  @HttpCode(200)
  @UseGuards(OwnPasswordAttemptGuard)
  remove(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: ExtraPhoneRemoveDto,
  ) {
    return this.extraPhone.remove(studentId, userId, dto.currentPassword);
  }
}
