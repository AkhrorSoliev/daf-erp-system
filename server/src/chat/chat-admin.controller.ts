import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { CeoOnly } from '../common/permissions/access.decorators';
import { ChatAdminSettingsService } from './chat-admin-settings.service';
import {
  ListReportsQueryDto,
  ResolveReportDto,
  UpdateChatSettingsDto,
} from './dto/chat.dto';
import { ChatBanService } from './reports/chat-ban.service';
import { ChatReportsService } from './reports/chat-reports.service';

/**
 * The CEO's side of the student chat: reports and the ban. CEO identity, never
 * a capability (spec 2026-10-25). The student chat switch does not gate it —
 * the CEO can review after the chat was turned off.
 */
@Controller('chat/admin')
@CeoOnly()
export class ChatAdminController {
  constructor(
    private readonly reports: ChatReportsService,
    private readonly ban: ChatBanService,
    private readonly chatSettings: ChatAdminSettingsService,
  ) {}

  @Get('settings')
  getSettings(@CurrentUser('companyId') companyId: number) {
    return this.chatSettings.read(companyId);
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateChatSettingsDto,
  ) {
    return this.chatSettings.update(companyId, dto, userId);
  }

  @Get('banned')
  banned(@CurrentUser('companyId') companyId: number) {
    return this.ban.listBanned(companyId);
  }

  @Get('reports')
  list(
    @CurrentUser('companyId') companyId: number,
    @Query() q: ListReportsQueryDto,
  ) {
    return this.reports.list(companyId, q);
  }

  @Get('reports/:id')
  get(
    @CurrentUser('companyId') companyId: number,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reports.get(companyId, id);
  }

  @Patch('reports/:id')
  resolve(
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.reports.resolve(companyId, userId, id, dto);
  }

  @Post('students/:studentId/ban')
  banStudent(
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.ban.ban(studentId, companyId, userId);
  }

  @Post('students/:studentId/unban')
  unbanStudent(
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.ban.unban(studentId, companyId, userId);
  }
}
