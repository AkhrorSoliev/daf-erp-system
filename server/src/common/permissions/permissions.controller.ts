import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AnyUser } from './access.decorators';
import { PermissionsService } from './permissions.service';

/**
 * The caller's own capabilities, for the client to hide what they may not
 * use. Not under `/auth/`: the client's interceptor refreshes an expired
 * token for every path except `/auth/*` (spec §7.7).
 */
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get('me')
  @AnyUser()
  async me(@CurrentUser('id') userId: number) {
    const { keys } = await this.permissions.forUser(userId);
    return { keys: [...keys].sort() };
  }
}
