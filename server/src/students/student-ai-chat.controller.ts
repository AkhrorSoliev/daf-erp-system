import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { StudentAiChatService } from './student-ai-chat.service';
import { CreateAiConversationDto } from './dto/create-ai-conversation.dto';
import { SendAiMessageDto } from './dto/send-ai-message.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles, CurrentUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('student-portal/ai-chat')
@UseGuards(RolesGuard)
@Roles('Student')
export class StudentAiChatController {
  private readonly logger = new Logger(StudentAiChatController.name);

  constructor(private service: StudentAiChatService) {}

  @Post()
  create(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @Body() dto: CreateAiConversationDto,
  ) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.service.createConversation(studentId, userId, companyId, dto);
  }

  @Get()
  list(
    @CurrentUser('studentId') studentId: number,
    @Query() query: PaginationDto,
  ) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.service.getConversations(
      studentId,
      query.page ?? 1,
      query.pageSize ?? 10,
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser('studentId') studentId: number) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.service.getConversation(id, studentId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('studentId') studentId: number) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');
    return this.service.deleteConversation(id, studentId);
  }

  @Post(':id/stream')
  async streamMessage(
    @Param('id') conversationId: string,
    @Body() dto: SendAiMessageDto,
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @Res() res: Response,
  ) {
    if (!studentId) throw new NotFoundException('Talaba topilmadi');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      const {
        stream,
        conversationId: convId,
        isFirstExchange,
        conversationTitle,
      } = await this.service.sendMessageStream(
        conversationId,
        studentId,
        userId,
        companyId,
        dto.content,
      );

      let fullContent = '';
      for await (const chunk of stream) {
        fullContent += chunk;
        res.write(
          `data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`,
        );
      }

      const [saved, suggestions] = await Promise.all([
        this.service.saveStreamedResponse(
          convId,
          fullContent,
          isFirstExchange,
          conversationTitle,
        ),
        this.service.generateSuggestions(
          dto.content,
          fullContent,
          await this.service.extractStudentLevel(studentId),
        ),
      ]);

      res.write(
        `data: ${JSON.stringify({ type: 'done', messageId: saved.id, suggestions })}\n\n`,
      );
    } catch (error) {
      this.logger.error('AI stream error', error);
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: 'AI javob berishda xatolik yuz berdi' })}\n\n`,
      );
    } finally {
      res.end();
    }
  }
}
