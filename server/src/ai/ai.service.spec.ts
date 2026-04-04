import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';

describe('AiService', () => {
  describe('when OPENAI_API_KEY is not set', () => {
    let service: AiService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue(undefined) },
          },
        ],
      }).compile();

      service = module.get(AiService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('chatCompletion should throw when client is not initialized', async () => {
      await expect(
        service.chatCompletion({
          messages: [{ role: 'user', content: 'test' }],
        }),
      ).rejects.toThrow('OpenAI client ishga tushmagan');
    });

    it('streamChatCompletion should throw when client is not initialized', async () => {
      const generator = service.streamChatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      await expect(
        (async () => {
          for await (const _ of generator) {
            // should throw before yielding
          }
        })(),
      ).rejects.toThrow('OpenAI client ishga tushmagan');
    });
  });

  describe('when OPENAI_API_KEY is set', () => {
    let service: AiService;

    const mockCreate = jest.fn();

    beforeEach(async () => {
      mockCreate.mockReset();

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('sk-test-key') },
          },
        ],
      }).compile();

      service = module.get(AiService);

      // Replace the internal OpenAI client's chat.completions.create
      (service as any).client = {
        chat: { completions: { create: mockCreate } },
      };
    });

    it('chatCompletion should return formatted response', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Hello!' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
        model: 'gpt-4o-mini',
      });

      const result = await service.chatCompletion({
        messages: [{ role: 'user', content: 'Hi' }],
        systemPrompt: 'You are helpful',
      });

      expect(result).toEqual({
        content: 'Hello!',
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
        model: 'gpt-4o-mini',
      });

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hi' },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      });
    });

    it('chatCompletion should use custom model and temperature', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        model: 'gpt-4o',
      });

      await service.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
        model: 'gpt-4o',
        temperature: 0.3,
        maxTokens: 512,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          temperature: 0.3,
          max_tokens: 512,
        }),
      );
    });

    it('chatCompletion should work without systemPrompt', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'reply' } }],
        usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
        model: 'gpt-4o-mini',
      });

      await service.chatCompletion({
        messages: [{ role: 'user', content: 'hello' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'hello' }],
        }),
      );
    });
  });
});
