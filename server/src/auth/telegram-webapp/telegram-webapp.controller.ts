import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { IpThrottlerGuard } from '../../common/guards';
import { TelegramWebAppLoginDto } from '../dto/telegram-webapp-login.dto';
import { TelegramWebAppService } from './telegram-webapp.service';

/**
 * Telegram Mini App ichidan kirish (ADR-0039). Web portallarning Telegram
 * OAuth eshiklari `auth.controller.ts` da; bu — faqat Mini App uchun.
 */
@Controller('auth/telegram')
export class TelegramWebAppController {
  constructor(private readonly telegramWebApp: TelegramWebAppService) {}

  /**
   * `initData` → sessiya, farzand tanlash ro'yxati yoki «ro'yxatdan o'tmagan».
   *
   * 60/min/IP — parol kirishining 10 tasidan ancha keng: bu yerda taxmin
   * qilinadigan sir yo'q (imzoni faqat Telegram yasay oladi), Mini App esa har
   * ochilishda shu so'rovni yuboradi va markaz Wi-Fi'sidagi o'quvchilar bitta
   * IP'dan keladi — dars boshida o'nlab odam bir daqiqada ochadi.
   */
  @Public()
  @UseGuards(IpThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post('webapp')
  async signIn(@Body() dto: TelegramWebAppLoginDto) {
    return this.telegramWebApp.signIn(dto.initData, dto.studentId);
  }
}
