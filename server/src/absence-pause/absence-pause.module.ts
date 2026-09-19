import { Module } from '@nestjs/common';
import { AbsencePauseController } from './absence-pause.controller';
import { AbsencePauseSettingModule } from './absence-pause-setting.module';

@Module({
  imports: [AbsencePauseSettingModule],
  controllers: [AbsencePauseController],
})
export class AbsencePauseModule {}
