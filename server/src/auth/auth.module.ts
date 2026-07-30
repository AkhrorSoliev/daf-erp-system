import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ForgotPasswordService } from './forgot-password/forgot-password.service';
import { TelegramOauthConfig } from './telegram-oauth/telegram-oauth.config';
import { TelegramOauthStateStore } from './telegram-oauth/telegram-oauth-state.store';
import { TelegramIdTokenVerifier } from './telegram-oauth/telegram-id-token.verifier';
import { TelegramOauthService } from './telegram-oauth/telegram-oauth.service';
import { EskizModule } from '../eskiz/eskiz.module';
import { PasswordResetModule } from '../common/password-reset';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET')!,
      }),
    }),
    EskizModule,
    PasswordResetModule,
    // Per-IP rate limiting for the auth endpoints (brute-force / credential
    // stuffing shield). IpThrottlerGuard keys on the real client IP behind the
    // proxy. Applied per-endpoint in AuthController, not globally.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    ForgotPasswordService,
    TelegramOauthConfig,
    TelegramOauthStateStore,
    TelegramIdTokenVerifier,
    TelegramOauthService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
