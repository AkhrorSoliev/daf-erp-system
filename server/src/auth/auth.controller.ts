import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Query,
  Res,
  UseGuards,
  Request,
  Req,
  Body,
  HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ForgotPasswordService } from './forgot-password/forgot-password.service';
import { TelegramOauthConfig } from './telegram-oauth/telegram-oauth.config';
import { TelegramOauthStateStore } from './telegram-oauth/telegram-oauth-state.store';
import { TelegramOauthService } from './telegram-oauth/telegram-oauth.service';
import { resolveAllowedRoleIds } from './portal-roles.config';
import { Public } from '../common/decorators';
import { IpThrottlerGuard } from '../common/guards';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import { ForgotPasswordVerifyDto } from './dto/forgot-password-verify.dto';
import { ForgotPasswordResetDto } from './dto/forgot-password-reset.dto';
import { TelegramOauthStartDto } from './dto/telegram-oauth-start.dto';
import { TelegramOauthCallbackDto } from './dto/telegram-oauth-callback.dto';
import { TelegramOauthCompleteDto } from './dto/telegram-oauth-complete.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private forgotPasswordService: ForgotPasswordService,
    private telegramOauthConfig: TelegramOauthConfig,
    private telegramOauthStateStore: TelegramOauthStateStore,
    private telegramOauthService: TelegramOauthService,
  ) {}

  @Public()
  // ThrottlerGuard runs first so failed credential attempts are counted too:
  // 10 attempts / minute / IP before 429. Then local auth validates the body.
  @UseGuards(IpThrottlerGuard, AuthGuard('local'))
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Request() req, @Body() _loginDto: LoginDto) {
    const origin = req.headers['origin'] as string | undefined;
    // Native apps send X-Portal (no browser Origin) — gates the student app to role 6.
    const portal = req.headers['x-portal'] as string | undefined;
    return this.authService.login(req.user, origin, portal);
  }

  @Public()
  // Looser than login (legit clients may refresh from several tabs), but still
  // caps refresh-token guessing: 30 / minute / IP.
  @UseGuards(IpThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  // Native app (link/poll): poll a login request until the bot approves it.
  @Public()
  @Get('otp/poll')
  async pollLogin(@Query('requestId') requestId: string) {
    return this.authService.pollLoginRequest(requestId ?? '');
  }

  // ── Telegram OAuth (OIDC) — web portallar uchun ────────────────────────────
  /** Klient tugmani ko'rsatishdan oldin funksiya yoniqligini so'raydi. */
  @Public()
  @Get('telegram/status')
  telegramStatus() {
    return { enabled: this.telegramOauthConfig.enabled };
  }

  /**
   * Oqimni boshlaydi: `state` + PKCE yasab, Telegram'ning authorize URL'ini
   * qaytaradi. Klient shu URL'ga o'tadi.
   */
  @Public()
  @UseGuards(IpThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('telegram/start')
  async telegramStart(
    @Query() query: TelegramOauthStartDto,
    @Req() req,
  ) {
    const origin =
      query.origin ?? (req.headers['origin'] as string | undefined) ?? '';
    const url = await this.telegramOauthStateStore.createAuthorizeUrl(origin);
    return { url };
  }

  /**
   * Telegram shu manzilga redirect qiladi. Javob — portalga 302.
   *
   * `@Res()` bilan javobni to'g'ridan-to'g'ri Express'ning `res.redirect()`i
   * orqali yozamiz (Nest'da qaytish qiymati orqali redirect qilishning tayyor
   * yo'li yo'q — `redirectUrl` ish vaqtida hisoblanadi, deklarativ
   * `@Redirect()` esa faqat statik/handler-qaytargan qiymatga mos keladi).
   * Handler har doim yo redirect qiladi, yoki istisno tashlaydi — so'rov hech
   * qachon osilib qolmaydi.
   */
  @Public()
  @UseGuards(IpThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('telegram/callback')
  async telegramCallback(
    @Query() query: TelegramOauthCallbackDto,
    @Res() res,
  ) {
    if (query.error) {
      // Foydalanuvchi Telegram ekranida rad etdi — bu xato emas.
      throw new BadRequestException("Kirish bekor qilindi");
    }
    const { redirectUrl } = await this.telegramOauthService.handleCallback(
      query.code ?? '',
      query.state ?? '',
    );
    res.redirect(302, redirectUrl);
  }

  /** SPA bir martalik `handoff` ni tokenlarga almashtiradi. */
  @Public()
  @UseGuards(IpThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('telegram/complete')
  async telegramComplete(@Body() dto: TelegramOauthCompleteDto) {
    return this.telegramOauthService.completeHandoff(dto.handoff);
  }

  // ── SMS "forgot password" (Eskiz OTP) ──────────────────────────────────────
  // Step 1: request a 4-digit code by SMS. Always returns a generic message
  // (anti-enumeration) — never reveals whether the phone is registered.
  @Public()
  @HttpCode(200)
  @Post('forgot-password/request')
  async forgotPasswordRequest(
    @Body() dto: ForgotPasswordRequestDto,
    @Req() req,
  ) {
    // Scope the reset to the calling portal's roles so a phone shared across
    // accounts resets the right one (admin phone on admin.*, teacher on lehrer.*).
    const origin = req.headers['origin'] as string | undefined;
    const portal = req.headers['x-portal'] as string | undefined;
    const allowedRoleIds = resolveAllowedRoleIds(origin, portal);
    return this.forgotPasswordService.requestCode(
      dto.phone,
      clientIp(req),
      allowedRoleIds,
    );
  }

  // Step 2: verify the code → returns a single-use reset token.
  @Public()
  @HttpCode(200)
  @Post('forgot-password/verify')
  async forgotPasswordVerify(@Body() dto: ForgotPasswordVerifyDto) {
    return this.forgotPasswordService.verifyCode(dto.phone, dto.code);
  }

  // Step 3: set a new password using the reset token.
  @Public()
  @HttpCode(200)
  @Post('forgot-password/reset')
  async forgotPasswordReset(@Body() dto: ForgotPasswordResetDto) {
    return this.forgotPasswordService.resetPassword(
      dto.resetToken,
      dto.newPassword,
    );
  }
}

/** Best-effort client IP for rate-limiting (honours x-forwarded-for behind a proxy). */
function clientIp(req: any): string | undefined {
  const fwd = req?.headers?.['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req?.ip;
}
