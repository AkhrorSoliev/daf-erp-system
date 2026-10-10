import { Module } from '@nestjs/common';
import { ContractDocumentsController } from './contract-documents.controller';
import { ContractDocumentsService } from './contract-documents.service';
import { ContractLifecycleService } from './contract-lifecycle.service';

@Module({
  controllers: [ContractDocumentsController],
  providers: [ContractDocumentsService, ContractLifecycleService],
})
export class ContractDocumentsModule {}
