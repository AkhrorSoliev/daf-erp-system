import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators';
import { IpThrottlerGuard } from '../common/guards';
import { MetaLeadAdsService } from './meta-lead-ads.service';
import { verifyMetaSignature } from './meta-lead-ads.util';

/** Meta Lead Ads webhook (Instagram and Facebook instant forms). */
@Controller('webhooks/meta-leads')
@Public()
@UseGuards(IpThrottlerGuard)
export class MetaLeadAdsController {
  constructor(private readonly service: MetaLeadAdsService) {}

  // Meta's one-time subscription check: echo `hub.challenge` for our token.
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode !== 'subscribe' || token !== this.service.verifyToken) {
      throw new ForbiddenException();
    }
    return challenge;
  }

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: object,
  ) {
    if (!verifyMetaSignature(req.rawBody, signature, this.service.appSecret)) {
      throw new UnauthorizedException();
    }
    await this.service.handle(body);
    return { ok: true };
  }
}
