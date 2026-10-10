import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { CurrentUser, Public } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';
import { GenerateEmployeeLinkDto } from './dto/generate-employee-link.dto';

@Controller('telegram')
export class TelegramController {
  constructor(private telegramService: TelegramService) {}

  @Public()
  @Post('webhook')
  async webhook(@Req() req: any, @Res() res: any) {
    await this.telegramService.handleWebhook(req, res);
    if (!res.headersSent) {
      res.status(200).send('ok');
    }
  }

  @Can('employees.invite')
  @Post('employee-link')
  async generateEmployeeLink(
    @Body() dto: GenerateEmployeeLinkDto,
    // The id only: the service reads the caller's roles and branches from the
    // database, because the token's copy can be an hour stale.
    @CurrentUser('id') callerId: number,
  ): Promise<{ payload: string }> {
    const payload = await this.telegramService.generateEmployeeLinkPayload(
      dto.branchId,
      dto.roleIds,
      { id: callerId },
    );
    return { payload };
  }
}
