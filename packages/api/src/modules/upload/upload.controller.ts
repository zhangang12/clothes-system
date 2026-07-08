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
    // 按真实内容(magic bytes)校验类型,不受支持则删除并拒绝;扩展名与内容对齐
    this.fileService.finalizeUpload(file);
    const info = this.fileService.buildFileInfo(file);
    return {
      url: `/api/v1/uploads/file?p=${encodeURIComponent(info.relativePath)}`,
      relativePath: info.relativePath,
      originalName: info.originalName,
      size: info.size,
      mimeType: info.mimeType,
    };
  }

  // 通过 API 前缀流式返回文件（<img>/<a> 直接引用；uuid 文件名作能力 URL）。
  // 安全:强制安全 Content-Type + nosniff + 非图片/PDF 一律附件下载,杜绝浏览器内联执行(存储型 XSS)。
  // 注:上传时已按 magic bytes 限定为图片/PDF/Excel,故此处不会出现可执行类型。
  // 待办:端点级授权(签名 URL / 短时令牌),使敏感附件不再仅凭 UUID 能力 URL 可下载(需前端配合改动)。
  @Get('file')
  @ApiOperation({ summary: '读取已上传文件' })
  getFile(@Query('p') relativePath: string, @Res() res: Response) {
    if (!relativePath) throw new BadRequestException('缺少文件路径');
    const full = this.fileService.resolvePath(relativePath);
    if (!full) throw new NotFoundException('文件不存在');
    const contentType = this.fileService.contentTypeFor(relativePath);
    const inline = contentType.startsWith('image/') || contentType === 'application/pdf';
    res.sendFile(full, {
      headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': inline ? 'inline' : 'attachment',
      },
    });
  }
}
