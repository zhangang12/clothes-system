import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { diskStorage, Options } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export interface UploadedFileInfo {
  originalName: string;
  storedName: string;
  relativePath: string; // 相对于 uploadRoot 的路径，用于写入数据库
  size: number;
  mimeType: string;
}

@Injectable()
export class FileService {
  private readonly uploadRoot: string;

  constructor(private readonly config: ConfigService) {
    this.uploadRoot = config.get('UPLOAD_ROOT', '/data/uploads');
  }

  /**
   * 生成 multer diskStorage 配置，按日期分子目录
   */
  getMulterOptions(subDir: string): Options {
    return {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const today = new Date();
          const dir = path.join(
            this.uploadRoot,
            subDir,
            String(today.getFullYear()),
            String(today.getMonth() + 1).padStart(2, '0'),
          );
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname);
          cb(null, `${uuidv4()}${ext}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'image/jpeg', 'image/png', 'image/webp',
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ];
        if (!allowed.includes(file.mimetype)) {
          cb(new BadRequestException(`不支持的文件类型: ${file.mimetype}`), false);
        } else {
          cb(null, true);
        }
      },
    };
  }

  /**
   * 将已上传的 Express.Multer.File 转换为统一的 UploadedFileInfo
   */
  buildFileInfo(file: Express.Multer.File): UploadedFileInfo {
    const relativePath = path.relative(this.uploadRoot, file.path).replace(/\\/g, '/');
    return {
      originalName: file.originalname,
      storedName: file.filename,
      relativePath,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  /**
   * 将相对路径转换为 X-Accel-Redirect 内部路径（给 Nginx 用）
   */
  toAccelPath(relativePath: string): string {
    return `/internal/files/${relativePath}`;
  }

  /**
   * 删除文件（逻辑删除时也删物理文件）
   */
  deleteFile(relativePath: string): void {
    const fullPath = path.join(this.uploadRoot, relativePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
}
