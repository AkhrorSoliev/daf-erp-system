import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { StudentCardGuard } from '../common/guards';
import { StudentOnly } from '../common/permissions/access.decorators';
import { ChatAccessService } from './access/chat-access.service';
import { SetUsernameDto } from './dto/chat.dto';
import { ChatUsernameService } from './username/chat-username.service';

/**
 * Student-to-student chat (spec 2026-10-25). Every route is the caller's own
 * card: the student id comes from the token, never from the request.
 */
@Controller('chat')
@UseGuards(StudentCardGuard)
@StudentOnly()
export class ChatController {
  constructor(
    private readonly access: ChatAccessService,
    private readonly usernames: ChatUsernameService,
  ) {}

  @Get('access')
  getAccess(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.access.forStudent(studentId, companyId);
  }

  @Put('username')
  setUsername(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
    @Body() dto: SetUsernameDto,
  ) {
    return this.usernames.set(studentId, companyId, dto.username);
  }
}
