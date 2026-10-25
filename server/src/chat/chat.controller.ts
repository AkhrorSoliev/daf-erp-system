import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { StudentCardGuard } from '../common/guards';
import { StudentOnly } from '../common/permissions/access.decorators';
import { ChatAccessService } from './access/chat-access.service';
import {
  BlockDto,
  SearchQueryDto,
  SetUsernameDto,
  UpdatePrivacyDto,
} from './dto/chat.dto';
import { ChatPeopleService } from './people/chat-people.service';
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
    private readonly people: ChatPeopleService,
  ) {}

  @Get('me')
  me(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.people.getMine(studentId, companyId);
  }

  @Patch('privacy')
  updatePrivacy(
    @CurrentUser('studentId') studentId: number,
    @Body() dto: UpdatePrivacyDto,
  ) {
    return this.people.updatePrivacy(studentId, dto);
  }

  @Post('block')
  block(@CurrentUser('studentId') studentId: number, @Body() dto: BlockDto) {
    return this.people.block(studentId, dto.studentId);
  }

  @Post('unblock')
  unblock(@CurrentUser('studentId') studentId: number, @Body() dto: BlockDto) {
    return this.people.unblock(studentId, dto.studentId);
  }

  @Get('search')
  search(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
    @Query() query: SearchQueryDto,
  ) {
    return this.people.search(studentId, companyId, query.q);
  }

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
