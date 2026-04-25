import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StudentAiChatController } from './student-ai-chat.controller';
import { StudentAiChatService } from './student-ai-chat.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('StudentAiChatController — role guards', () => {
  let controller: StudentAiChatController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    createConversation: jest.fn().mockResolvedValue({}),
    getConversations: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    getConversation: jest.fn().mockResolvedValue({}),
    deleteConversation: jest.fn().mockResolvedValue({}),
    sendMessageStream: jest.fn().mockResolvedValue({}),
    saveStreamedResponse: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentAiChatController],
      providers: [{ provide: StudentAiChatService, useValue: mockService }],
    }).compile();

    controller = module.get(StudentAiChatController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(handler: Function, roles: string[]) {
    return {
      getHandler: () => handler,
      getClass: () => StudentAiChatController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('class-level @Roles(Student)', () => {
    it('should have Student role metadata on the controller class', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, StudentAiChatController);
      expect(roles).toEqual(['Student']);
    });
  });

  describe('create()', () => {
    it('should allow Student', () => {
      const ctx = mockExecutionContext(controller.create, ['Student']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny CEO', () => {
      const ctx = mockExecutionContext(controller.create, ['CEO']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher', () => {
      const ctx = mockExecutionContext(controller.create, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Administrator', () => {
      const ctx = mockExecutionContext(controller.create, ['Administrator']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('list()', () => {
    it('should allow Student', () => {
      const ctx = mockExecutionContext(controller.list, ['Student']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny non-Student roles', () => {
      const ctx = mockExecutionContext(controller.list, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('getOne()', () => {
    it('should allow Student', () => {
      const ctx = mockExecutionContext(controller.getOne, ['Student']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny non-Student roles', () => {
      const ctx = mockExecutionContext(controller.getOne, ['CEO']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('remove()', () => {
    it('should allow Student', () => {
      const ctx = mockExecutionContext(controller.remove, ['Student']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny non-Student roles', () => {
      const ctx = mockExecutionContext(controller.remove, ['Administrator']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('streamMessage()', () => {
    it('should allow Student', () => {
      const ctx = mockExecutionContext(controller.streamMessage, ['Student']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny non-Student roles', () => {
      const ctx = mockExecutionContext(controller.streamMessage, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
