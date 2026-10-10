import { Module } from '@nestjs/common';
import { RefundableController } from './refundable.controller';
import { RefundableService } from './refundable.service';

@Module({ controllers: [RefundableController], providers: [RefundableService] })
export class RefundableModule {}
