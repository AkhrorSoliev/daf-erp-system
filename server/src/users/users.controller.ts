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
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePhoneDto } from './dto/change-phone.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BranchScope } from '../common/decorators';
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
  ) {}

  @Get()
  @Can('employees.view', 'teachers.view', 'groups.manage')
  findAll(
    @Query() query: UserQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.usersService.findAll(query, companyId, branchScope);
  }

  @Get(':id')
  @Can('employees.view', 'teachers.view')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.usersService.findById(id, companyId, branchScope);
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

  @Patch('password')
  @AnyUser()
  @UseGuards(OwnPasswordAttemptGuard)
  async changePassword(
    @CurrentUser('id') userId: number,
    @Body() dto: ChangePasswordDto,
  ) {
    const { sessionVersion, ...result } =
      await this.usersService.changePassword(userId, dto);
    // The change ended every session of this account, the caller's included
    // (ADR-0030). A fresh pair, signed with the version this change produced,
    // keeps THIS device signed in.
    return {
      ...result,
      ...(await this.authService.issueSession(userId, sessionVersion)),
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
  ) {
    return this.authService.logoutOtherSessions(userId, sessionVersion);
  }

  // Declared before `@Patch(':id')`: routes match in declaration order, and
  // `:id` would take "phone" and fail its ParseIntPipe.
  @Patch('phone')
  @AnyStaff()
  @UseGuards(OwnPasswordAttemptGuard)
  changePhone(@CurrentUser('id') userId: number, @Body() dto: ChangePhoneDto) {
    return this.usersService.changeOwnPhone(userId, dto);
  }

  // Own profile, password and phone go through `profile` / `password` /
  // `phone` above.
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
