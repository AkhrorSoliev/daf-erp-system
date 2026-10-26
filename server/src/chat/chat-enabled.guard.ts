import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { SettingsService } from '../settings/settings.service';
import { CHAT_OFF_MESSAGE } from './chat.constants';
import { isChatTester } from './chat-testers';

const CHAT_GATE_OPEN = 'chat:gateOpen';

/** Marks a handler that must answer even while `chat.enabled` is off (`GET /chat/access` reports it). */
export const ChatGateOpen = () => SetMetadata(CHAT_GATE_OPEN, true);

/** Closes every chat route while the company switch `chat.enabled` is off. */
@Injectable()
export class ChatEnabledGuard implements CanActivate {
  constructor(
    private readonly settings: SettingsService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const open = this.reflector.get<boolean | undefined>(
      CHAT_GATE_OPEN,
      context.getHandler(),
    );
    if (open) return true;
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { companyId?: number; studentId?: number } }>();
    if (isChatTester(this.config, user?.studentId)) return true;
    const companyId = user?.companyId;
    if (
      typeof companyId !== 'number' ||
      !(await this.settings.get(companyId, 'chat.enabled'))
    ) {
      throw new ForbiddenException(CHAT_OFF_MESSAGE);
    }
    return true;
  }
}
