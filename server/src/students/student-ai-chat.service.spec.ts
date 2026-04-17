import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StudentAiChatService } from './student-ai-chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

const mockConversation = {
  id: 'conv-uuid-1',
  userId: 1,
  studentId: 10001,
  companyId: 1,
  useCase: 'STUDENT_CHAT',
  chatMode: 'FREE_CONVERSATION',
  title: null,
  model: 'gpt-4o-mini',
  totalTokens: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  messages: [],
};

const mockMessage = {
  id: 'msg-uuid-1',
  conversationId: 'conv-uuid-1',
  role: 'user',
  content: 'Hallo, wie geht es dir?',
  createdAt: new Date(),
};

describe('StudentAiChatService', () => {
  let service: StudentAiChatService;
  let prisma: any;
  let aiService: any;

  beforeEach(async () => {
    prisma = {
      aiConversation: {
        create: jest.fn().mockResolvedValue(mockConversation),
        findMany: jest.fn().mockResolvedValue([mockConversation]),
        findFirst: jest.fn().mockResolvedValue(mockConversation),
        count: jest.fn().mockResolvedValue(1),
        delete: jest.fn().mockResolvedValue(mockConversation),
        update: jest.fn().mockResolvedValue(mockConversation),
      },
      aiChatMessage: {
        create: jest.fn().mockResolvedValue(mockMessage),
      },
      enrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            group: {
              course: { name: 'Deutsch A2 Intensiv' },
            },
          },
        ]),
      },
      student: {
        findFirst: jest.fn().mockResolvedValue({ firstName: 'Ahror' }),
      },
    };

    aiService = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: 'Mir geht es gut, danke!',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        model: 'gpt-4o-mini',
      }),
      streamChatCompletion: jest.fn().mockReturnValue(
        (async function* () {
          yield 'Mir ';
          yield 'geht ';
          yield 'es gut!';
        })(),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentAiChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: aiService },
      ],
    }).compile();

    service = module.get(StudentAiChatService);
  });

  describe('createConversation()', () => {
    it('should create a conversation with STUDENT_CHAT useCase', async () => {
      await service.createConversation(10001, 1, 1, {
        mode: 'FREE_CONVERSATION',
      });

      expect(prisma.aiConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 10001,
            userId: 1,
            companyId: 1,
            useCase: 'STUDENT_CHAT',
            chatMode: 'FREE_CONVERSATION',
          }),
        }),
      );
    });

    it('should create with optional title', async () => {
      await service.createConversation(10001, 1, 1, {
        mode: 'ROLEPLAY',
        title: 'Im Restaurant',
      });

      expect(prisma.aiConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            chatMode: 'ROLEPLAY',
            title: 'Im Restaurant',
          }),
        }),
      );
    });
  });

  describe('getConversations()', () => {
    it('should return paginated conversations', async () => {
      const result = await service.getConversations(10001, 1, 10);

      expect(prisma.aiConversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { studentId: 10001, useCase: 'STUDENT_CHAT' },
          skip: 0,
          take: 10,
        }),
      );
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('pageSize', 10);
    });

    it('should calculate skip correctly for page 2', async () => {
      await service.getConversations(10001, 2, 10);

      expect(prisma.aiConversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('getConversation()', () => {
    it('should return conversation with messages', async () => {
      const result = await service.getConversation('conv-uuid-1', 10001);
      expect(result).toBeDefined();
      expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-uuid-1', studentId: 10001 },
        }),
      );
    });

    it('should throw NotFoundException if conversation not found', async () => {
      prisma.aiConversation.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.getConversation('non-existent', 10001),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteConversation()', () => {
    it('should delete conversation', async () => {
      const result = await service.deleteConversation('conv-uuid-1', 10001);

      expect(prisma.aiConversation.delete).toHaveBeenCalledWith({
        where: { id: 'conv-uuid-1' },
      });
      expect(result).toHaveProperty('message');
    });

    it('should throw NotFoundException if conversation not found', async () => {
      prisma.aiConversation.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.deleteConversation('non-existent', 10001),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendMessageStream()', () => {
    it('should save user message and return stream', async () => {
      const result = await service.sendMessageStream(
        'conv-uuid-1',
        10001,
        1,
        1,
        'Hallo!',
      );

      expect(prisma.aiChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: 'conv-uuid-1',
            role: 'user',
            content: 'Hallo!',
          }),
        }),
      );
      expect(result).toHaveProperty('stream');
      expect(result).toHaveProperty('conversationId');
      expect(aiService.streamChatCompletion).toHaveBeenCalled();
    });

    it('should throw NotFoundException if conversation not found', async () => {
      prisma.aiConversation.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.sendMessageStream('non-existent', 10001, 1, 1, 'Hallo!'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should pass correct system prompt with student level', async () => {
      await service.sendMessageStream('conv-uuid-1', 10001, 1, 1, 'Hallo!');

      const call = aiService.streamChatCompletion.mock.calls[0][0];
      expect(call.systemPrompt).toContain('A2');
      expect(call.systemPrompt).toContain('Ahror');
    });
  });

  describe('saveStreamedResponse()', () => {
    it('should save assistant message and update token count', async () => {
      await service.saveStreamedResponse(
        'conv-uuid-1',
        'Mir geht es gut!',
        false,
        'Existing Title',
      );

      expect(prisma.aiChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: 'conv-uuid-1',
            role: 'assistant',
            content: 'Mir geht es gut!',
          }),
        }),
      );
      expect(prisma.aiConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-uuid-1' },
          data: { totalTokens: { increment: expect.any(Number) } },
        }),
      );
    });

    it('should auto-generate title on first exchange', async () => {
      await service.saveStreamedResponse(
        'conv-uuid-1',
        'Hallo Ahror! Wie geht es dir heute?',
        true,
        null,
      );

      // Should update title
      expect(prisma.aiConversation.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('extractStudentLevel()', () => {
    it('should extract level from course name', async () => {
      const level = await service.extractStudentLevel(10001);
      expect(level).toBe('A2');
    });

    it('should default to A1 if no level found', async () => {
      prisma.enrollment.findMany.mockResolvedValueOnce([
        { group: { course: { name: 'German Basics' } } },
      ]);

      const level = await service.extractStudentLevel(10001);
      expect(level).toBe('A1');
    });

    it('should default to A1 if no enrollments', async () => {
      prisma.enrollment.findMany.mockResolvedValueOnce([]);

      const level = await service.extractStudentLevel(10001);
      expect(level).toBe('A1');
    });
  });
});
