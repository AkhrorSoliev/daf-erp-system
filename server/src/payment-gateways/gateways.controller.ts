import { Body, Controller, Headers, Post, Query } from '@nestjs/common';
import { Public } from '../common/decorators';
import { PaymeService } from './payme/payme.service';
import { ClickService } from './click.service';
import { UzumService } from './uzum.service';

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
  ) {}

  /**
   * Paycom Merchant API endpoint (JSON-RPC 2.0).
   * Always returns HTTP 200 — errors are encoded in the JSON-RPC response body.
   */
  @Public()
  @Post('payme/webhook')
  paymeWebhook(
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
    @Query('companyId') companyId: string,
  ) {
    return this.payme.handleWebhook(body, headers, Number(companyId));
  }

  @Public()
  @Post('click/webhook')
  clickWebhook(@Body() body: unknown, @Query('companyId') companyId: string) {
    return this.click.handleWebhook(body, Number(companyId));
  }

  @Public()
  @Post('uzum/webhook')
  uzumWebhook(
    @Body() body: unknown,
    @Headers() headers: Record<string, string>,
    @Query('companyId') companyId: string,
  ) {
    return this.uzum.handleWebhook(body, headers, Number(companyId));
  }
}
