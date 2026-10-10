import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { StudentCardGuard } from '../common/guards';
import { StudentOnly } from '../common/permissions/access.decorators';
import { TelegramStatementService } from './telegram-statement.service';

/**
 * The student portal's «Telegram'ga yuborish» inside the Mini App: the
 * caller's own statement goes to their linked chat. Here rather than beside
 * `GET /student-portal/statement.pdf` because `TelegramModule` already imports
 * `StatementsModule`, and the reverse import would be a cycle.
 */
@Controller('student-portal')
@UseGuards(StudentCardGuard)
@StudentOnly()
export class TelegramStatementController {
  constructor(private readonly sender: TelegramStatementService) {}

  @Post('statement/telegram')
  @HttpCode(200)
  async sendMyStatement(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.sender.sendToLinkedChat(studentId, companyId);
    return { sent: true };
  }
}
