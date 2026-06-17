import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  Header,
} from '@nestjs/common';
import type { Response } from 'express';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { PushService } from './push.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { PushSubscriptionDto } from './dto/push-subscription.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
    private pushService: PushService,
  ) {}

  @Get()
  findAll(
    @CurrentUser('id') userId: number,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationsService.findByUser(userId, query);
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser('id') userId: number) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Public()
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { key: this.pushService.getVapidPublicKey() };
  }

  @Get('stream')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  stream(@CurrentUser('id') userId: number, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    this.gateway.addClient(userId, res);

    res.on('close', () => {
      this.gateway.removeClient(userId, res);
    });
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.notificationsService.markRead(id, userId);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser('id') userId: number) {
    return this.notificationsService.markAllRead(userId);
  }

  @Post('push/subscribe')
  subscribePush(
    @CurrentUser('id') userId: number,
    @Body() dto: PushSubscriptionDto,
  ) {
    return this.notificationsService.registerPush(
      userId,
      dto.endpoint,
      dto.p256dh,
      dto.auth,
    );
  }

  @Delete('push/unsubscribe')
  unsubscribePush(
    @CurrentUser('id') userId: number,
    @Body() dto: { endpoint: string },
  ) {
    return this.notificationsService.unregisterPush(userId, dto.endpoint);
  }

  // Native app: register / unregister an Expo push token for the current user.
  @Post('devices')
  registerDevice(
    @CurrentUser('id') userId: number,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.notificationsService.registerDevice(
      userId,
      dto.token,
      dto.platform,
      dto.appVersion,
    );
  }

  @Delete('devices')
  unregisterDevice(
    @CurrentUser('id') userId: number,
    @Body() dto: { token: string },
  ) {
    return this.notificationsService.unregisterDevice(userId, dto.token);
  }
}
