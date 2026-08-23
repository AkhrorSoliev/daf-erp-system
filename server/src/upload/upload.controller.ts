import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles, STAFF_ROLES } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { UploadService } from './upload.service';
import {
  ALLOWED_IMAGE_MIMES,
  MAX_UPLOAD_BYTES,
  UPLOAD_TYPE_MESSAGE,
} from './upload.constraints';

@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  /**
   * Staff only. The global `JwtAuthGuard` proves a caller is logged in and
   * nothing more, so this route accepted a student-portal token too — and it
   * writes into a PUBLIC bucket. Students have their own photo route
   * (`POST /student-portal/photo`, gated to the Student role) and the three
   * screens that call this one all live in the dashboard.
   *
   * The multer `fileFilter` below rejects before the file is buffered; the
   * authoritative check is in `UploadService`, which every other caller also
   * goes through.
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
          return cb(new BadRequestException(UPLOAD_TYPE_MESSAGE), false);
        }
        cb(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Fayl yuklanmadi');
    }

    const url = await this.uploadService.uploadFile(file);
    return { url };
  }
}
