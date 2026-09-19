import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AbsencePauseController } from './absence-pause.controller';
import { AbsencePauseSettingService } from './absence-pause-setting.service';
import { ROLES_KEY } from '../common/decorators';

describe('AbsencePauseController — rollar', () => {
  let controller: AbsencePauseController;
  let reflector: Reflector;

  const mockService = {
    get: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AbsencePauseController],
      providers: [
        { provide: AbsencePauseSettingService, useValue: mockService },
      ],
    }).compile();

    controller = module.get(AbsencePauseController);
    reflector = new Reflector();
  });

  it("o'qish CEO va Branch Director uchun ochiq", () => {
    expect(reflector.get<string[]>(ROLES_KEY, controller.get)).toEqual([
      'CEO',
      'Branch Director',
    ]);
  });

  it('yozish faqat CEO uchun — sozlama butun kompaniyaga taalluqli', () => {
    expect(reflector.get<string[]>(ROLES_KEY, controller.update)).toEqual([
      'CEO',
    ]);
  });

  it('Student hech qayerga kira olmaydi', () => {
    for (const handler of [controller.get, controller.update]) {
      expect(reflector.get<string[]>(ROLES_KEY, handler)).not.toContain(
        'Student',
      );
    }
  });
});
