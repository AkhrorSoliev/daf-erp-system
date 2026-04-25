import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { AiMessage } from '../ai/ai.types';
import {
  CreateAiConversationDto,
  AiChatMode,
} from './dto/create-ai-conversation.dto';
import { buildDeutschTutorPrompt } from '../ai/prompts/deutsch-tutor.prompt';

const MAX_CONTEXT_MESSAGES = 20;
const LEVEL_REGEX = /\b(C2|C1|B2|B1\+?|A2|A1)\b/i;

@Injectable()
export class StudentAiChatService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  async createConversation(
    studentId: number,
    userId: number,
    companyId: number,
    dto: CreateAiConversationDto,
  ) {
    const conversation = await this.prisma.aiConversation.create({
      data: {
        userId,
        studentId,
        companyId,
        useCase: 'STUDENT_CHAT',
        chatMode: dto.mode,
        title: dto.title ?? null,
        model: 'gpt-4o-mini',
      },
      select: {
        id: true,
        chatMode: true,
        title: true,
        createdAt: true,
      },
    });

    // Grammar Practice va Roleplay da AI birinchi xabarni avtomatik yuboradi
    if (dto.mode !== 'FREE_CONVERSATION') {
      await this.generateOpeningMessage(conversation.id, studentId, dto.mode);
    }

    return conversation;
  }

  private async generateOpeningMessage(
    conversationId: string,
    studentId: number,
    mode: string,
  ) {
    const studentName = await this.getStudentName(studentId);
    const level = await this.extractStudentLevel(studentId);

    const openingPrompts: Record<string, string> = {
      GRAMMAR_PRACTICE: `Du bist ein Deutschlehrer. Der Student "${studentName}" (Niveau ${level}) möchte Grammatik üben. Wähle ein passendes Grammatikthema für ${level} und beginne mit einer kurzen Erklärung (2-3 Sätze, auf Deutsch). Dann gib eine erste Übungsaufgabe. Erkläre das Thema kurz auf Usbekisch in Klammern. Halte es kurz und motivierend.`,
      ROLEPLAY: `Du bist ein Deutschlehrer. Der Student "${studentName}" (Niveau ${level}) möchte ein Rollenspiel machen. Wähle ein passendes Alltagsszenario für ${level} (z.B. im Café, beim Arzt, im Supermarkt). Beschreibe die Situation kurz auf Deutsch und erkläre auf Usbekisch in Klammern, welche Rolle der Student spielt. Beginne dann mit dem ersten Satz deiner Rolle. Halte es kurz.`,
    };

    const prompt = openingPrompts[mode];
    if (!prompt) return;

    try {
      const result = await this.aiService.chatCompletion({
        messages: [{ role: 'user', content: prompt }],
        systemPrompt: buildDeutschTutorPrompt({ studentName, level, mode }),
        temperature: 0.8,
        maxTokens: 300,
      });

      await this.prisma.aiChatMessage.create({
        data: {
          conversationId,
          role: 'assistant',
          content: result.content,
        },
      });

      // Set auto-generated title
      const title = this.generateTitle(result.content);
      await this.prisma.aiConversation.update({
        where: { id: conversationId },
        data: {
          title,
          totalTokens: result.usage.totalTokens,
        },
      });
    } catch {
      // Opening message is not critical — conversation still works
    }
  }

  async getConversations(studentId: number, page: number, pageSize: number) {
    const where = {
      studentId,
      useCase: 'STUDENT_CHAT' as const,
    };

    const [data, total] = await Promise.all([
      this.prisma.aiConversation.findMany({
        where,
        select: {
          id: true,
          chatMode: true,
          title: true,
          totalTokens: true,
          createdAt: true,
          updatedAt: true,
          messages: {
            select: { content: true, role: true },
            orderBy: { createdAt: 'desc' as const },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aiConversation.count({ where }),
    ]);

    return {
      data: data.map((c) => ({
        id: c.id,
        chatMode: c.chatMode,
        title: c.title,
        totalTokens: c.totalTokens,
        lastMessage: c.messages[0]?.content ?? null,
        lastMessageRole: c.messages[0]?.role ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getConversation(conversationId: string, studentId: number) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, studentId },
      select: {
        id: true,
        chatMode: true,
        title: true,
        totalTokens: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Suhbat topilmadi');
    }

    return conversation;
  }

  async deleteConversation(conversationId: string, studentId: number) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, studentId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Suhbat topilmadi');
    }

    await this.prisma.aiConversation.delete({
      where: { id: conversationId },
    });

    return { message: "Suhbat o'chirildi" };
  }

  async sendMessageStream(
    conversationId: string,
    studentId: number,
    userId: number,
    companyId: number,
    content: string,
  ) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, studentId },
      select: {
        id: true,
        chatMode: true,
        title: true,
        totalTokens: true,
        messages: {
          select: { role: true, content: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Suhbat topilmadi');
    }

    // Save user message
    await this.prisma.aiChatMessage.create({
      data: {
        conversationId,
        role: 'user',
        content,
      },
    });

    // Build context
    const studentName = await this.getStudentName(studentId);
    const level = await this.extractStudentLevel(studentId);
    const mode = (conversation.chatMode as AiChatMode) ?? 'FREE_CONVERSATION';

    const systemPrompt = buildDeutschTutorPrompt({
      studentName,
      level,
      mode,
    });

    // Take last N messages for context (including the new user message)
    const allMessages = [
      ...conversation.messages,
      { role: 'user' as const, content },
    ];
    const contextMessages: AiMessage[] = allMessages
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((m) => ({
        role: m.role as AiMessage['role'],
        content: m.content,
      }));

    const stream = this.aiService.streamChatCompletion({
      messages: contextMessages,
      systemPrompt,
      temperature: 0.7,
      maxTokens: 1024,
    });

    return {
      stream,
      conversationId,
      isFirstExchange: conversation.messages.length === 0,
      conversationTitle: conversation.title,
    };
  }

  async saveStreamedResponse(
    conversationId: string,
    fullContent: string,
    isFirstExchange: boolean,
    currentTitle: string | null,
  ) {
    const message = await this.prisma.aiChatMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: fullContent,
      },
      select: { id: true, createdAt: true },
    });

    // Estimate tokens (rough: ~4 chars per token)
    const estimatedTokens = Math.ceil(fullContent.length / 4);
    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { totalTokens: { increment: estimatedTokens } },
    });

    // Auto-generate title from first exchange
    if (isFirstExchange && !currentTitle) {
      const title = this.generateTitle(fullContent);
      await this.prisma.aiConversation.update({
        where: { id: conversationId },
        data: { title },
      });
    }

    return message;
  }

  async extractStudentLevel(studentId: number): Promise<string> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, deletedAt: null, status: 'ACTIVE' },
      select: {
        group: {
          select: {
            course: { select: { name: true } },
          },
        },
      },
    });

    for (const enrollment of enrollments) {
      const courseName = enrollment.group.course?.name ?? '';
      const match = courseName.match(LEVEL_REGEX);
      if (match) {
        return match[1].toUpperCase();
      }
    }

    return 'A1';
  }

  private async getStudentName(studentId: number): Promise<string> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId },
      select: { firstName: true },
    });
    return student?.firstName ?? 'Freund';
  }

  async generateSuggestions(
    userMessage: string,
    assistantResponse: string,
    level: string,
  ): Promise<string[]> {
    try {
      const result = await this.aiService.chatCompletion({
        messages: [
          {
            role: 'user',
            content: `Student (${level}) wrote: "${userMessage}"
Assistant replied: "${assistantResponse.slice(0, 300)}"

Generate exactly 3 short follow-up messages (in German, ${level} level) the student might want to say next. Each must be under 40 characters. Return ONLY 3 lines, nothing else.`,
          },
        ],
        systemPrompt:
          'You generate short German conversation suggestions for language students. Return exactly 3 lines, no numbering, no quotes, no extra text.',
        temperature: 0.9,
        maxTokens: 100,
      });

      return result.content
        .split('\n')
        .map((s) =>
          s
            .replace(/^\d+[.)]\s*/, '')
            .replace(/^[""]|[""]$/g, '')
            .trim(),
        )
        .filter((s) => s.length > 0 && s.length <= 50)
        .slice(0, 3);
    } catch {
      return [];
    }
  }

  private generateTitle(assistantResponse: string): string {
    // Extract first meaningful sentence/phrase as title
    const clean = assistantResponse
      .replace(/✏️|🎭|📝|🗣️/gu, '')
      .replace(/\*\*/g, '')
      .trim();
    const firstSentence = clean.split(/[.!?\n]/)[0]?.trim() ?? '';
    if (firstSentence.length > 50) {
      return firstSentence.substring(0, 47) + '...';
    }
    return firstSentence || 'Deutsch Chat';
  }
}
