import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import {
  LEAD_OWNER_CHANGED,
  type LeadOwnerChangedPayload,
} from '../leads/lead-events';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { leadOwnerNotices } from './lead-owner-notices';

/** The bell side of a lead's owner change (ADR-0092): information, no action. */
@Injectable()
export class LeadOwnerNotifyListener {
  private readonly logger = new Logger(LeadOwnerNotifyListener.name);

  constructor(
    private notifications: NotificationsService,
    private gateway: NotificationsGateway,
  ) {}

  @OnEvent(LEAD_OWNER_CHANGED)
  async onChanged(p: LeadOwnerChangedPayload): Promise<void> {
    for (const n of leadOwnerNotices(p)) {
      try {
        const notification = await this.notifications.create({
          userId: n.userId,
          type: NotificationType.SYSTEM,
          title: n.title,
          message: n.message,
          relatedEntityType: 'Lead',
          relatedEntityId: p.leadId,
          companyId: p.companyId,
        });
        this.gateway.sendToUser(n.userId, {
          type: 'notification',
          notification,
        });
      } catch (err) {
        this.logger.warn(
          `lead ${p.leadId} owner notice to ${n.userId} failed: ${(err as Error).message}`,
        );
      }
    }
  }
}
