import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HolidaysService {
  constructor(private prisma: PrismaService) {}
}
