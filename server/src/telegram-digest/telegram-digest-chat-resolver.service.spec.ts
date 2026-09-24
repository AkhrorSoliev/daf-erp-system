import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramDigestChatResolverService } from './telegram-digest-chat-resolver.service';

describe('TelegramDigestChatResolverService', () => {
  let service: TelegramDigestChatResolverService;
  let studentFindFirst: jest.Mock;
  let userFindFirst: jest.Mock;

  beforeEach(async () => {
    studentFindFirst = jest.fn();
    userFindFirst = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramDigestChatResolverService,
        {
          provide: PrismaService,
          useValue: {
            student: { findFirst: studentFindFirst },
            user: { findFirst: userFindFirst },
          },
        },
      ],
    }).compile();
    service = module.get(TelegramDigestChatResolverService);
  });

  it('resolves any non-deleted student, whatever their status', async () => {
    studentFindFirst.mockResolvedValue({ telegramChatId: 'chat-1' });

    await expect(service.resolveChatId('STUDENT', 10042)).resolves.toBe(
      'chat-1',
    );
    // Only deletedAt — a frozen, departed or graduated student still gets
    // receipts (CEO decision 2026-09-23). No isActive, no status.
    expect(studentFindFirst).toHaveBeenCalledWith({
      where: { id: 10042, deletedAt: null },
      select: { telegramChatId: true },
    });
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it('returns null for a student without a chat id', async () => {
    studentFindFirst.mockResolvedValue({ telegramChatId: null });
    await expect(service.resolveChatId('STUDENT', 10042)).resolves.toBeNull();
  });

  it('returns null when the student is deleted or missing', async () => {
    studentFindFirst.mockResolvedValue(null);
    await expect(service.resolveChatId('STUDENT', 10042)).resolves.toBeNull();
  });

  it('resolves only an active staff member', async () => {
    userFindFirst.mockResolvedValue({ telegramChatId: 'chat-2' });

    await expect(service.resolveChatId('USER', 10001)).resolves.toBe('chat-2');
    expect(userFindFirst).toHaveBeenCalledWith({
      where: {
        id: 10001,
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
      },
      select: { telegramChatId: true },
    });
    expect(studentFindFirst).not.toHaveBeenCalled();
  });

  it('returns null for a staff member without a chat id', async () => {
    userFindFirst.mockResolvedValue({ telegramChatId: null });
    await expect(service.resolveChatId('USER', 10001)).resolves.toBeNull();
  });

  it('returns null when the staff member is inactive or missing', async () => {
    userFindFirst.mockResolvedValue(null);
    await expect(service.resolveChatId('USER', 10001)).resolves.toBeNull();
  });
});
