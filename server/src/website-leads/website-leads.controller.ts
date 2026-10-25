import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../common/decorators';
import { IpThrottlerGuard } from '../common/guards';
import { WebsiteLeadsService } from './website-leads.service';

export class WebsiteLeadDto {
  @IsString()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MaxLength(100)
  lastName: string;

  @IsString()
  @MaxLength(30)
  phone: string;

  @Type(() => Number)
  @IsInt()
  branchId: number;

  // Sayt formasi: «Bepul konsultatsiya», «Kurslar» ...
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;
}

/** dafzentrum.uz formalaridan kelgan lidlar (server-server, umumiy kalit bilan). */
@Controller('public/website-leads')
@Public()
@UseGuards(IpThrottlerGuard)
export class WebsiteLeadsController {
  constructor(private readonly service: WebsiteLeadsService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async receive(
    @Headers('x-website-key') key: string | undefined,
    @Body() dto: WebsiteLeadDto,
  ) {
    this.service.assertKey(key);
    await this.service.create(dto);
    return { ok: true };
  }
}
