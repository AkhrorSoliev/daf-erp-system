import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../decorators/current-user.decorator';
import { HistoryQueryDto } from '../entity-history/dto/history-query.dto';
import { CeoOnly } from './access.decorators';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RolePermissionsService } from './role-permissions.service';

/**
 * The «Ruxsatlar» page (spec §7.7, ADR-0086). CEO-only by database role
 * (`@CeoOnly()`), never a capability: whoever could open it could grant
 * themselves everything. `GET /permissions/me` stays in `PermissionsController`.
 * The marker sits on every handler, not the class: a handler-level marker
 * would override a class-level one.
 */
@Controller('permissions')
export class RolePermissionsController {
  constructor(private readonly rolePermissions: RolePermissionsService) {}

  @Get()
  @CeoOnly()
  overview(@CurrentUser('companyId') companyId: number) {
    return this.rolePermissions.overview(companyId);
  }

  @Get('history')
  @CeoOnly()
  history(
    @Query() query: HistoryQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.rolePermissions.history(
      companyId,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }

  @Put('roles/:roleId')
  @CeoOnly()
  update(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.rolePermissions.updateRole(
      companyId,
      roleId,
      dto.changes,
      userId,
    );
  }

  @Post('roles/:roleId/reset')
  @CeoOnly()
  reset(
    @Param('roleId', ParseIntPipe) roleId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.rolePermissions.resetRole(companyId, roleId, userId);
  }
}
