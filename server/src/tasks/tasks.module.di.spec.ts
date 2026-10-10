import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { DebtAgeModule } from '../common/finance/debt-age.module';
import { EntityHistoryModule } from '../common/entity-history';
import { StatusHistoryModule } from '../common/status';
import { StudentOriginModule } from '../common/student-origin';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisModule } from '../redis/redis.module';
import { RedisService } from '../redis/redis.service';
import { TelegramService } from '../telegram/telegram.service';
import { TaskTelegramHandler } from './telegram/task-telegram.handler';
import { TaskTelegramListener } from './telegram/task-telegram.listener';
import { TaskTelegramOutbox } from './telegram/task-telegram-outbox.service';
import { TaskTelegramSender } from './telegram/task-telegram.sender';
import { TasksModule } from './tasks.module';
import { TasksService } from './tasks.service';

// No unit spec boots the Nest graph; `TasksModule` imports `TelegramModule`
// (ADR-0078), so a missing provider would only show at deploy. This compiles
// the real module graph (no `init()`: no bot, no database, no Redis).
describe('TasksModule — DI graph', () => {
  it('resolves every provider of TasksModule and its imports', async () => {
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
        TasksModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(RedisService)
      .useValue({})
      .compile();

    for (const token of [
      TasksService,
      TaskTelegramSender,
      TaskTelegramListener,
      TaskTelegramOutbox,
      TaskTelegramHandler,
      TelegramService,
    ]) {
      expect(moduleRef.get(token, { strict: false })).toBeDefined();
    }
    await moduleRef.close();
  });
});
