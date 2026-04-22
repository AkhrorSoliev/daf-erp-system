import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { PaymeService } from './payme/payme.service';
import { ClickService } from './click/click.service';
import { UzumService } from './uzum.service';
import { GatewayEventsService } from './gateway-events.service';
import { GatewayEventsQueryDto } from './dto/gateway-events-query.dto';

/**
 * Webhook endpoints for payment providers. Public (no JWT) because providers
 * call in from their own infra — they authenticate via request signature,
 * which each service verifies before any business processing.
 *
 * companyId is required as a query parameter because a single deploy can
 * serve multiple companies, each with its own merchant account.
 */
@Controller('gateways')
export class GatewaysController {
  constructor(
    private payme: PaymeService,
    private click: ClickService,
    private uzum: UzumService,
    private events: GatewayEventsService,
  ) {}

  /**
   * Admin audit log — list payment gateway webhook events with filters.
   * CEO-only: raw webhook payloads may contain sensitive transaction details.
   */
  @UseGuards(RolesGuard)
  @Roles('CEO')
  @Get('events')
  listEvents(
    @Query() query: GatewayEventsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.events.findAll({ ...query, companyId });
  }

  /**
   * Paycom Merchant API endpoint (JSON-RPC 2.0).
   * Always returns HTTP 200 — errors are encoded in the JSON-RPC response body.
   */
  @Public()
  @HttpCode(200)
  @Post('payme/webhook')
  paymeWebhook(
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
    @Query('companyId') companyId: string,
  ) {
    return this.payme.handleWebhook(body, headers, Number(companyId));
  }

  @Public()
  @HttpCode(200)
  @Post('click/webhook')
  clickWebhook(@Body() body: unknown, @Query('companyId') companyId: string) {
    return this.click.handleWebhook(body, Number(companyId));
  }

  @Public()
  @HttpCode(200)
  @Post('uzum/webhook')
  uzumWebhook(
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
    @Query('companyId') companyId: string,
  ) {
    return this.uzum.handleWebhook(body, headers, Number(companyId));
  }
}
