import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { CustomFormsService } from './custom-forms.service';
import { SubmitFormDto } from './dto/submit-form.dto';
import { Public } from '../common/decorators';

@Controller('public/forms')
@Public()
export class CustomFormsPublicController {
  constructor(private readonly service: CustomFormsService) {}

  // 30 schema fetches per IP per 10 min — slightly looser than submits so
  // the page can be reloaded without locking out.
  @Get(':slug')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  getSchema(@Param('slug') slug: string) {
    return this.service.getPublicSchema(slug);
  }

  // 10 submissions per IP per 10 min — basic spam shield.
  @Post(':slug/submit')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  submit(
    @Param('slug') slug: string,
    @Body() dto: SubmitFormDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    const ua = req.headers['user-agent'];
    return this.service.submit(slug, dto, {
      ipAddress: ip,
      userAgent: typeof ua === 'string' ? ua.slice(0, 500) : undefined,
    });
  }
}
