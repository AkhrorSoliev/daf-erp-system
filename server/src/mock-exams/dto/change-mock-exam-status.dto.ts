import { IsEnum } from 'class-validator';
import { MockExamStatus } from '@prisma/client';

export class ChangeMockExamStatusDto {
  @IsEnum(MockExamStatus)
  status: MockExamStatus;
}
