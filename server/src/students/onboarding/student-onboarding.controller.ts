import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard, StudentCardGuard } from '../../common/guards';
import { OwnPasswordAttemptGuard } from '../../common/guards/own-password-attempt.guard';
import { StudentOnboardingService } from './student-onboarding.service';
import { UpdateOnboardingProfileDto } from './dto/update-onboarding-profile.dto';
import { VerifyPhoneCodeDto } from './dto/verify-phone-code.dto';
import { ChangePhoneCodeDto } from './dto/change-phone-code.dto';

/**
 * What the student must give before the portal opens (ADR-0039). Both the web
 * portal and the native app read `GET /student-portal/onboarding` and show the
 * missing steps before anything else.
 *
 * Every route is the caller's own card: the id comes from the token, never
 * from the request. `StudentCardGuard` refuses a token without one (404).
 */
@Controller('student-portal/onboarding')
@UseGuards(RolesGuard, StudentCardGuard)
@Roles('Student')
export class StudentOnboardingController {
  constructor(private readonly onboarding: StudentOnboardingService) {}

  @Get()
  status(@CurrentUser('studentId') studentId: number) {
    return this.onboarding.status(studentId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateOnboardingProfileDto,
  ) {
    return this.onboarding.updateProfile(studentId, userId, dto);
  }

  @Post('phone/send-code')
  @HttpCode(200)
  sendPhoneCode(@CurrentUser('studentId') studentId: number) {
    return this.onboarding.sendPhoneCode(studentId);
  }

  /**
   * The card's number is not the student's: the code goes to the number they
   * type, and a correct code replaces the card's number with it. Asks for the
   * current password (ADR-0031), so it carries the shared attempt cap.
   */
  @Post('phone/change-code')
  @HttpCode(200)
  @UseGuards(OwnPasswordAttemptGuard)
  sendChangeCode(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: ChangePhoneCodeDto,
  ) {
    return this.onboarding.sendChangeCode(
      studentId,
      userId,
      dto.phone,
      dto.currentPassword,
    );
  }

  @Post('phone/verify')
  @HttpCode(200)
  verifyPhoneCode(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: VerifyPhoneCodeDto,
  ) {
    return this.onboarding.verifyPhoneCode(studentId, userId, dto.code);
  }
}
