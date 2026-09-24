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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles, BranchScope } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { RolesGuard } from '../common/guards';

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);
  constructor(
    private usersService: UsersService,
    private authService: AuthService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  findAll(
    @Query() query: UserQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.usersService.findAll(query, companyId, branchScope);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.usersService.findById(id, companyId, branchScope);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
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
  updateProfile(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Patch('password')
  async changePassword(
    @CurrentUser('id') userId: number,
    @Body() dto: ChangePasswordDto,
  ) {
    const result = await this.usersService.changePassword(userId, dto);
    // The change ended every session of this account, the caller's included
    // (ADR-0029). A fresh pair keeps THIS device signed in.
    return { ...result, ...(await this.authService.issueSession(userId)) };
  }

  /**
   * "Log out other devices" — any signed-in account, on itself only: the id
   * comes from the token, never from the request.
   */
  @Post('logout-others')
  @HttpCode(200)
  logoutOthers(@CurrentUser('id') userId: number) {
    return this.authService.logoutOtherSessions(userId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.usersService.updateUser(id, dto, userId, companyId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.usersService.softDelete(id, userId, companyId);
  }
}
