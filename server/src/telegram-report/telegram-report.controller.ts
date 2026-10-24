import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { CeoOnly } from '../common/permissions/access.decorators';
import {
  CreateRecipientDto,
  UpdateRecipientDto,
} from './dto/telegram-report.dto';
import { TelegramReportRecipientsService } from './telegram-report-recipients.service';

/** Personal Telegram report recipients (ADR-0095). The CEO's alone, by identity. */
@Controller('telegram-report')
export class TelegramReportController {
  constructor(private readonly recipients: TelegramReportRecipientsService) {}

  @Get('recipients')
  @CeoOnly()
  list(@CurrentUser('companyId') companyId: number) {
    return this.recipients.list(companyId);
  }

  @Get('candidates')
  @CeoOnly()
  candidates(@CurrentUser('companyId') companyId: number) {
    return this.recipients.candidates(companyId);
  }

  @Post('recipients')
  @CeoOnly()
  create(
    @Body() dto: CreateRecipientDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.recipients.create(companyId, userId, dto.userId);
  }

  @Patch('recipients/:id')
  @CeoOnly()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRecipientDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.recipients.update(companyId, userId, id, dto);
  }

  @Delete('recipients/:id')
  @CeoOnly()
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.recipients.remove(companyId, userId, id);
  }

  @Post('recipients/:id/check')
  @CeoOnly()
  check(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.recipients.check(companyId, id);
  }

  @Get('recipients/:id/preview')
  @CeoOnly()
  preview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.recipients.preview(companyId, id);
  }

  @Post('recipients/:id/test')
  @CeoOnly()
  test(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.recipients.test(companyId, id);
  }
}
