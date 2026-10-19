import { Module } from '@nestjs/common';
import { HolidaysModule } from '../../holidays/holidays.module';
import { SmsModule } from '../../sms/sms.module';
import { TelegramModule } from '../../telegram/telegram.module';
import { EslatmaCron } from './eslatma.cron';
import { EslatmaTelegramHandler } from './eslatma-telegram.handler';
import { EslatmaYuborish } from './eslatma-yuborish';

/**
 * S4: kechki eslatma va dushanba xulosasi (ADR-0117). `DafModule` dan
 * alohida: yuborish `SmsModule` (u `TelegramModule` ni oladi) orqali, `DafModule`
 * esa `AppActivityModule` ga import qilingan — o'quv bo'limi Telegram
 * zanjiriga bog'lanmaydi. Bir tomonlama: bu modulni faqat `AppModule` import qiladi.
 */
@Module({
  imports: [SmsModule, TelegramModule, HolidaysModule],
  providers: [EslatmaYuborish, EslatmaCron, EslatmaTelegramHandler],
})
export class EslatmaModule {}
