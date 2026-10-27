import {
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SIGNED_URL_SECONDS } from '../../tasks/task-file-rules';
import {
  CHAT_FILES_OFF_MESSAGE,
  CHAT_FILE_GONE_MESSAGE,
} from '../chat.constants';
import {
  ChatConversationsService,
  type MessageView,
} from '../conversations/chat-conversations.service';
import { checkChatFile, chatFileKey } from './chat-file-rules';
import { ChatFileStorage } from './chat-file-storage';

@Injectable()
export class ChatMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ChatFileStorage,
    private readonly conversations: ChatConversationsService,
  ) {}

  /**
   * Same checks as a text (access, membership, block, privacy, rate), then the
   * bytes decide the type. The object is stored first and taken back if the
   * row cannot be written, so there is never a row without an object.
   */
  async upload(
    me: number,
    companyId: number,
    conversationId: string,
    input: { buffer: Buffer; durationSec?: number; replyToId?: string },
  ): Promise<MessageView> {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException(CHAT_FILES_OFF_MESSAGE);
    }
    const { peerId } = await this.conversations.prepareSend(
      me,
      companyId,
      conversationId,
      input.replyToId,
    );
    const { mime, ext, kind } = checkChatFile(input);
    const key = chatFileKey(companyId, conversationId, ext);
    await this.storage.put(key, input.buffer, mime);
    try {
      return await this.conversations.commitMessage(
        me,
        companyId,
        conversationId,
        peerId,
        {
          kind,
          fileKey: key,
          mime,
          sizeBytes: input.buffer.length,
          durationSec: kind === 'VOICE' ? (input.durationSec ?? null) : null,
          replyToId: input.replyToId,
        },
      );
    } catch (err) {
      await this.storage.remove(key);
      throw err;
    }
  }

  /** A 10-minute link for a member of the conversation; never the key itself. */
  async signedUrl(
    me: number,
    messageId: string,
  ): Promise<{ url: string; expiresInSec: number }> {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException(CHAT_FILES_OFF_MESSAGE);
    }
    const m = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, deletedAt: null, fileKey: { not: null } },
      select: {
        id: true,
        fileKey: true,
        mime: true,
        mediaPurgedAt: true,
        conversation: { select: { studentLowId: true, studentHighId: true } },
      },
    });
    // The same 404 for "no such file" and "not your conversation".
    if (
      !m ||
      !m.fileKey ||
      (m.conversation.studentLowId !== me &&
        m.conversation.studentHighId !== me)
    ) {
      throw new NotFoundException('Fayl topilmadi');
    }
    if (m.mediaPurgedAt) throw new GoneException(CHAT_FILE_GONE_MESSAGE);
    const ext = m.fileKey.slice(m.fileKey.lastIndexOf('.'));
    const url = await this.storage.signedGet(
      m.fileKey,
      m.mime ?? 'application/octet-stream',
      `fayl${ext}`,
      false,
    );
    return { url, expiresInSec: SIGNED_URL_SECONDS };
  }
}
