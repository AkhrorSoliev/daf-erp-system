import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const AI_CHAT_MODES = [
  'FREE_CONVERSATION',
  'GRAMMAR_PRACTICE',
  'ROLEPLAY',
] as const;

export type AiChatMode = (typeof AI_CHAT_MODES)[number];

export class CreateAiConversationDto {
  @IsString()
  @IsIn(AI_CHAT_MODES)
  mode: AiChatMode;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;
}
