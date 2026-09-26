import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StatementLoader } from './statement.loader';
import { StatementService } from './statement.service';
import { StatementsController } from './statements.controller';
import { StatementPortalController } from './statement-portal.controller';

@Module({
  imports: [PrismaModule],
  controllers: [StatementsController, StatementPortalController],
  providers: [StatementLoader, StatementService],
  exports: [StatementService],
})
export class StatementsModule {}
