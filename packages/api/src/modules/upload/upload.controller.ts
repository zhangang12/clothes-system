import {
  Controller, Post, Get, Query, Res, UploadedFile, UseInterceptors, UseGuards,
  BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { FileService } from '../../common/services/file.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

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

  // 为敏感附件签发短时访问链接（须登录；<img>/window.open 用带令牌 URL 打开）。
  // L9 加固：①挂 RolesGuard(未声明 @Roles)——供应商 token 一律拒签，private 路径外泄也无法被门户账号兑换；
  // ②仅对「确属 private/ 且真实存在」的文件签发，失败统一 404，不暴露文件存在性差异。
  // （上传记录无归属数据可查，无法按上传者/业务单据逐文件判归属，故按角色整体收紧，残余风险见修复报告。）
  @Get('sign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '签发敏感附件短时访问链接（5分钟有效）' })
  sign(@Query('p') relativePath: string) {
    if (!relativePath) throw new BadRequestException('缺少文件路径');
    if (!this.fileService.canSign(relativePath)) {
      throw new NotFoundException('文件不存在或不可签发访问链接');
    }
    return {
      url: `/api/v1/uploads/file?p=${encodeURIComponent(relativePath)}&t=${this.fileService.signToken(relativePath)}`,
    };
  }

  // 通过 API 前缀流式返回文件（<img>/<a> 直接引用；uuid 文件名作能力 URL）。
  // 安全:强制安全 Content-Type + nosniff + 非图片/PDF 一律附件下载,杜绝浏览器内联执行(存储型 XSS)。
  // 注:上传时已按 magic bytes 限定为图片/PDF/Excel,故此处不会出现可执行类型。
  // 敏感附件(private/ 子目录:身份证/水单/发票等)须携带 /uploads/sign 签发的短时令牌(总览走查P0#7)。
  @Get('file')
  @ApiOperation({ summary: '读取已上传文件（敏感附件须带签名令牌）' })
  getFile(@Query('p') relativePath: string, @Query('t') token: string | undefined, @Res() res: Response) {
    if (!relativePath) throw new BadRequestException('缺少文件路径');
    if (this.fileService.isPrivate(relativePath) && !this.fileService.verifyToken(relativePath, token)) {
      throw new ForbiddenException('敏感附件需授权访问，请在系统内通过「查看」打开');
    }
    const full = this.fileService.resolvePath(relativePath);
    if (!full) throw new NotFoundException('文件不存在');
    const contentType = this.fileService.contentTypeFor(relativePath);
    const inline = contentType.startsWith('image/') || contentType === 'application/pdf';
    // 【缓存】文件名是 uuid，内容一旦写下就不会变，所以可以放心让浏览器长期缓存。
    // 不加这条的后果是实测出来的：合同/样衣的材料明细每行一张照片，一页几十张，
    // 每次进页面都要**逐张回源到 Node**（sendFile 默认 max-age=0，只能靠 ETag 走 304，
    // 依然是几十次往返）。生产上单张图最大 1.9MB、48 张超 500KB，这就是"点开合同要转半天"的来源。
    // private/ 用 `private` 而不是 `public`：签名链接不该被中间层/共享代理缓存下来给别人。
    res.sendFile(full, {
      headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': inline ? 'inline' : 'attachment',
        'Cache-Control': this.fileService.isPrivate(relativePath)
          ? 'private, max-age=300'          // 与签名令牌 5 分钟有效期对齐，过期后重新取签名
          : 'public, max-age=31536000, immutable',
      },
    });
  }
}
