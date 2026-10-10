import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';

/** Global: services anywhere may ask `PermissionsService.has(...)`. */
@Global()
@Module({
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
