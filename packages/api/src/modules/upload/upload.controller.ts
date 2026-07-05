import {
  Controller, Post, Get, Query, Res, UploadedFile, UseInterceptors, UseGuards,
  BadRequestException, NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { FileService } from '../../common/services/file.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('文件上传')
@Controller('uploads')
export class UploadController {
  constructor(private readonly fileService: FileService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传文件（图片/PDF/Excel，≤20MB），返回可直接引用的 URL' })
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('未接收到文件');
    const info = this.fileService.buildFileInfo(file);
    return {
      url: `/api/v1/uploads/file?p=${encodeURIComponent(info.relativePath)}`,
      relativePath: info.relativePath,
      originalName: info.originalName,
      size: info.size,
      mimeType: info.mimeType,
    };
  }

  // 通过 API 前缀流式返回文件（<img>/<a> 直接引用；uuid 文件名作能力 URL，无需鉴权头）
  @Get('file')
  @ApiOperation({ summary: '读取已上传文件' })
  getFile(@Query('p') relativePath: string, @Res() res: Response) {
    if (!relativePath) throw new BadRequestException('缺少文件路径');
    const full = this.fileService.resolvePath(relativePath);
    if (!full) throw new NotFoundException('文件不存在');
    res.sendFile(full);
  }
}
