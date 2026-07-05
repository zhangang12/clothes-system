import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadController } from './upload.controller';
import { FileService } from '../../common/services/file.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      useFactory: (fileService: FileService) => fileService.getMulterOptions('misc'),
      inject: [FileService],
    }),
  ],
  controllers: [UploadController],
})
export class UploadModule {}
