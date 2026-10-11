import { Global, Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { RolePermissionsController } from './role-permissions.controller';
import { RolePermissionsService } from './role-permissions.service';

/**
 * Global: services anywhere may ask `PermissionsService.has(...)`.
 * `RolePermissionsService` uses `EntityHistoryService`, which is global too.
 */
@Global()
@Module({
  controllers: [PermissionsController, RolePermissionsController],
  providers: [PermissionsService, RolePermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
