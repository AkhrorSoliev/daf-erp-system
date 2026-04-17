import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
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

  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  @Post('employee-link')
  async generateEmployeeLink(
    @Body() dto: GenerateEmployeeLinkDto,
    @CurrentUser() user: { id: number; roles: string[] },
  ): Promise<{ payload: string }> {
    const payload = await this.telegramService.generateEmployeeLinkPayload(
      dto.branchId,
      dto.roleIds,
      user,
    );
    return { payload };
  }
}
