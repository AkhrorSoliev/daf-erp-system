import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeUsername, usernameProblem } from './chat-username.rules';

@Injectable()
export class ChatUsernameService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sets (or changes) the caller's own username. The old one is free again at once. */
  async set(
    studentId: number,
    companyId: number,
    raw: string,
  ): Promise<{ username: string }> {
    const username = normalizeUsername(raw);
    const problem = usernameProblem(username);
    if (problem) throw new BadRequestException(problem);
    try {
      const { count } = await this.prisma.student.updateMany({
        where: { id: studentId, companyId, deletedAt: null },
        data: { username },
      });
      if (count === 0) throw new NotFoundException('Talaba topilmadi');
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Bu username band');
      }
      throw err;
    }
    return { username };
  }
}
