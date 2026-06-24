import { Module } from '@nestjs/common';
import { PortalPasswordResetService } from './portal-password-reset.service';

/**
 * Shared, channel-agnostic password-reset core. PrismaService and
 * EntityHistoryService come from global modules. Import this module wherever a
 * portal password reset is performed (currently the SMS forgot-password flow).
 */
@Module({
  providers: [PortalPasswordResetService],
  exports: [PortalPasswordResetService],
})
export class PasswordResetModule {}
