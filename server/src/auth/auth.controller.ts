import {
  Controller,
  Post,
  Get,
  Query,
  UseGuards,
  Request,
  Body,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { OtpExchangeDto } from './dto/otp-exchange.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @UseGuards(AuthGuard('local'))
  @Post('login')
  async login(@Request() req, @Body() _loginDto: LoginDto) {
    const origin = req.headers['origin'] as string | undefined;
    // Native apps send X-Portal (no browser Origin) — gates the student app to role 6.
    const portal = req.headers['x-portal'] as string | undefined;
    return this.authService.login(req.user, origin, portal);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  // Native app: exchange a Telegram-issued one-time code for a session.
  @Public()
  @Post('otp/exchange')
  async exchangeOtp(@Body() dto: OtpExchangeDto) {
    return this.authService.exchangeOtp(dto.code);
  }

  // Native app (link/poll): poll a login request until the bot approves it.
  @Public()
  @Get('otp/poll')
  async pollLogin(@Query('requestId') requestId: string) {
    return this.authService.pollLoginRequest(requestId ?? '');
  }
}
