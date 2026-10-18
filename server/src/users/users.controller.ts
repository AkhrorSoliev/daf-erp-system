import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  ParseUUIDPipe,
  UseGuards,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { UserQueryDto } from './dto/user-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUiSkinDto } from './dto/update-ui-skin.dto';
import { UpdateUiLocaleDto } from './dto/update-ui-locale.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePhoneDto } from './dto/change-phone.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BranchScope } from '../common/decorators';
import { PermissionsService } from '../common/permissions/permissions.service';
import {
  AnyStaff,
  AnyUser,
  Can,
} from '../common/permissions/access.decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { OwnPasswordAttemptGuard } from '../common/guards/own-password-attempt.guard';

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);
  constructor(
    private usersService: UsersService,
    private authService: AuthService,
    private permissions: PermissionsService,
  ) {}

  @Get()
  // `salary.pay`: the advance dialog's recipient list loads from here (ADR-0087).
  @Can('employees.view', 'teachers.view', 'groups.manage', 'salary.pay')
  async findAll(
    @Query() query: UserQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    // The employee's salary balance goes only to a caller who may see pay.
    return this.usersService.findAll(
      query,
      companyId,
      branchScope,
      await this.permissions.has(userId, 'salary.view'),
    );
  }

  /**
   * Profildagi «Faol seanslar» (ADR-0112): shu hisobning tirik qurilmalari.
   * Id token'dan olinadi, so'rovdan emas — boshqa hisobga yetib bo'lmaydi.
   * `:id` dan OLDIN e'lon qilingan: marshrut e'lon tartibida mos keladi va
   * `:id` "sessions" ni ParseIntPipe bilan 400 qilib yuborardi.
   */
  @Get('sessions')
  @AnyUser()
  listSessions(
    @CurrentUser('id') userId: number,
    @CurrentUser('sessionVersion') sessionVersion: number,
    @CurrentUser('sid') sid: string | undefined,
  ) {
    return this.authService.listSessions(userId, sessionVersion, sid);
  }

  @Get(':id')
  @Can('employees.view', 'teachers.view')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.usersService.findById(
      id,
      companyId,
      branchScope,
      await this.permissions.has(userId, 'salary.view'),
    );
  }

  // Administrators do not hold `employees.manage` (docs/role-access.md,
  // ADR-0027): they onboard teachers and cashiers through the Telegram link.
  @Post()
  @Can('employees.manage')
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') callerId: number,
  ) {
    this.logger.log(
      `Creating user: ${JSON.stringify({ ...dto, password: dto.password ? '***' : undefined, companyId })}`,
    );
    return this.usersService.create(
      { ...dto, companyId },
      { kind: 'user', id: callerId },
    );
  }

  @Patch('profile')
  @AnyUser()
  updateProfile(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Patch('ui-skin')
  @AnyStaff()
  updateUiSkin(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateUiSkinDto,
  ) {
    return this.usersService.updateUiSkin(userId, dto.skin);
  }

  @Patch('ui-locale')
  @AnyStaff()
  updateUiLocale(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateUiLocaleDto,
  ) {
    return this.usersService.updateUiLocale(userId, dto.locale);
  }

  @Patch('password')
  @AnyUser()
  @UseGuards(OwnPasswordAttemptGuard)
  async changePassword(
    @CurrentUser('id') userId: number,
    @CurrentUser('sid') sid: string | undefined,
    @Body() dto: ChangePasswordDto,
  ) {
    const { sessionVersion, ...result } =
      await this.usersService.changePassword(userId, dto);
    // The change ended every session of this account, the caller's included
    // (ADR-0030). A fresh pair, signed with the version this change produced,
    // keeps THIS device signed in (and on its own row in the list, ADR-0112).
    return {
      ...result,
      ...(await this.authService.issueSession(userId, sessionVersion, sid)),
    };
  }

  /**
   * "Log out other devices" — any signed-in account, on itself only: the id
   * comes from the token, never from the request.
   */
  @Post('logout-others')
  @AnyUser()
  @HttpCode(200)
  logoutOthers(
    @CurrentUser('id') userId: number,
    @CurrentUser('sessionVersion') sessionVersion: number,
    @CurrentUser('sid') sid: string | undefined,
  ) {
    return this.authService.logoutOtherSessions(userId, sessionVersion, sid);
  }

  @Delete('sessions/:sid')
  @AnyUser()
  revokeSession(
    @CurrentUser('id') userId: number,
    @CurrentUser('sid') callerSid: string | undefined,
    @Param('sid', ParseUUIDPipe) sid: string,
  ) {
    return this.authService.revokeSession(userId, sid, callerSid);
  }

  // Declared before `@Patch(':id')`: routes match in declaration order, and
  // `:id` would take "phone" and fail its ParseIntPipe.
  @Patch('phone')
  @AnyStaff()
  @UseGuards(OwnPasswordAttemptGuard)
  changePhone(@CurrentUser('id') userId: number, @Body() dto: ChangePhoneDto) {
    return this.usersService.changeOwnPhone(userId, dto);
  }

  // Own profile, password, phone, design skin and interface language go
  // through `profile` / `password` / `phone` / `ui-skin` / `ui-locale` above.
  @Patch(':id')
  @Can('employees.manage')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.usersService.updateUser(id, dto, userId, companyId);
  }

  @Delete(':id')
  @Can('employees.manage')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.usersService.softDelete(id, userId, companyId);
  }
}
