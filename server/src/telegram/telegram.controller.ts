import { Controller, Post, Req, Res } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { Public } from '../common/decorators';

@Controller('telegram')
export class TelegramController {
  constructor(private telegramService: TelegramService) {}

  @Public()
  @Post('webhook')
  async webhook(@Req() req: any, @Res() res: any) {
    await this.telegramService.handleWebhook(req, res);
    res.status(200).send('ok');
  }
}
