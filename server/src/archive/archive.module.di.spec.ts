import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { DebtAgeModule } from '../common/finance/debt-age.module';
import { EntityHistoryModule } from '../common/entity-history';
import { StatusHistoryModule } from '../common/status';
import { StudentOriginModule } from '../common/student-origin';
import { PermissionsModule } from '../common/permissions/permissions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisModule } from '../redis/redis.module';
import { RedisService } from '../redis/redis.service';
import { LeadOwnershipService } from '../leads/ownership/lead-ownership.service';
import { ArchiveRestoreService } from './archive-restore.service';
import { ArchiveModule } from './archive.module';

// No unit spec boots the Nest graph. `ArchiveModule` imports `LeadsModule` for
// `LeadOwnershipService` (ADR-0092), so a module cycle or a missing provider
// would only show at deploy. This compiles the real graph (no `init()`).
describe('ArchiveModule: DI graph', () => {
  it('resolves ArchiveRestoreService with LeadOwnershipService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: 'di-smoke-secret' })],
        }),
        EventEmitterModule.forRoot(),
        PrismaModule,
        RedisModule,
        DebtAgeModule,
        EntityHistoryModule,
        StatusHistoryModule,
        StudentOriginModule,
        PermissionsModule,
        ArchiveModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(RedisService)
      .useValue({})
      .compile();
    expect(
      moduleRef.get(ArchiveRestoreService, { strict: false }),
    ).toBeDefined();
    expect(
      moduleRef.get(LeadOwnershipService, { strict: false }),
    ).toBeDefined();
    await moduleRef.close();
  });
});
