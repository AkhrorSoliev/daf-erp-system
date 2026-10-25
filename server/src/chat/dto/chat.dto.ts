import { ChatFindWho, ChatWho } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MESSAGE_MAX } from '../chat.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SetUsernameDto {
  @IsString()
  @MaxLength(40)
  username!: string;
}

export class UpdatePrivacyDto {
  @IsOptional()
  @IsEnum(ChatWho)
  whoCanWrite?: ChatWho;

  @IsOptional()
  @IsEnum(ChatFindWho)
  whoCanFind?: ChatFindWho;

  @IsOptional()
  @IsEnum(ChatWho)
  whoSeesPhoto?: ChatWho;
}

export class BlockDto {
  @IsInt()
  @Min(1)
  studentId!: number;
}

export class SearchQueryDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  q!: string;
}

export class OpenConversationDto {
  /** Either an exact `@username` or a student id from search. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  username?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  studentId?: number;
}

export class SendMessageDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "Xabar bo'sh bo'lmasin" })
  @MaxLength(MESSAGE_MAX, { message: `Xabar ${MESSAGE_MAX} belgidan oshmasin` })
  text!: string;
}

export class MessagesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class UploadChatFileDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsInt()
  @Min(0)
  @Max(3600)
  durationSec?: number;
}
