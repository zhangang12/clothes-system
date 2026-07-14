import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { diskStorage, Options } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface UploadedFileInfo {
  originalName: string;
  storedName: string;
  relativePath: string; // 相对于 uploadRoot 的路径，用于写入数据库
  size: number;
  mimeType: string;
}

@Injectable()
export class FileService implements OnModuleInit {
  private readonly uploadRoot: string;

  // 受支持的真实文件类型(magic bytes 判定)→ 规范扩展名 + 响应 Content-Type。
  // 只允许无法在浏览器内联执行脚本的类型(光栅图/PDF/Excel),杜绝 HTML/SVG/JS 上传后被内联渲染(存储型 XSS)。
  private static readonly CONTENT_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
  };

  constructor(private readonly config: ConfigService) {
    this.uploadRoot = config.get('UPLOAD_ROOT', '/data/uploads');
  }

  onModuleInit() {
    fs.mkdirSync(this.uploadRoot, { recursive: true });
  }

  /**
   * 生成 multer diskStorage 配置，按日期分子目录
   */
  getMulterOptions(subDir: string): Options {
    return {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const today = new Date();
          // 敏感附件(身份证/水单/发票等)落 private/ 子目录,读取须签名令牌(总览走查P0#7)
          const sensitive = (req as any)?.query?.sensitive === '1' || (req as any)?.body?.sensitive === '1';
          const dir = path.join(
            this.uploadRoot,
            sensitive ? 'private' : subDir,
            String(today.getFullYear()),
            String(today.getMonth() + 1).padStart(2, '0'),
          );
          fs.mkdir(dir, { recursive: true }, (err) => cb(err ?? null, dir));
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
          // 部分系统/浏览器把 xlsx/xls(乃至 pdf)报成通用容器 MIME(Windows 尤其常见);
          // 放行后由 finalizeUpload 的 magic-byte 内容校验兜底把关——HTML/SVG/JS 等无合法魔数者
          // 仍会被删除并返回 400,既修「合法 Excel 被误拒并 500」又不削弱防存储型 XSS。
          'application/octet-stream', 'application/zip', 'application/x-zip-compressed',
        ];
        // 不在名单者静默丢弃(controller 以 400「未接收到文件」兜底),避免 cb(Error) 造成 500。
        cb(null, allowed.includes(file.mimetype));
      },
    };
  }

  /**
   * 按文件头 magic bytes 判定真实类型,返回规范扩展名;不受支持返回 null。
   * (不信任客户端 Content-Type / 原始扩展名)
   */
  detectExt(fullPath: string): string | null {
    let fd: number | null = null;
    try {
      fd = fs.openSync(fullPath, 'r');
      const buf = Buffer.alloc(16);
      const n = fs.readSync(fd, buf, 0, 16, 0);
      if (n >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png';
      if (n >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
      if (n >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
      if (n >= 4 && buf.toString('ascii', 0, 4) === '%PDF') return '.pdf';
      if (n >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return '.xlsx'; // ZIP → xlsx
      if (n >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return '.xls'; // OLE2 → xls
      return null;
    } catch {
      return null;
    } finally {
      if (fd !== null) fs.closeSync(fd);
    }
  }

  /**
   * 落盘后校验:按真实内容判定类型,不受支持则删除并抛错;
   * 扩展名与内容不符则改名对齐(防止 evil.html 伪装成 image/png 上传后被当 HTML 提供)。
   */
  finalizeUpload(file: Express.Multer.File): Express.Multer.File {
    const ext = this.detectExt(file.path);
    if (!ext) {
      try { fs.unlinkSync(file.path); } catch { /* ignore */ }
      throw new BadRequestException('文件内容不是受支持的类型(仅图片/PDF/Excel)');
    }
    const curExt = path.extname(file.path).toLowerCase();
    if (curExt !== ext) {
      const newPath = file.path.slice(0, file.path.length - curExt.length) + ext;
      fs.renameSync(file.path, newPath);
      file.path = newPath;
      file.filename = path.basename(newPath);
    }
    return file;
  }

  /** 按(已规范化的)扩展名返回安全响应 Content-Type;未知一律 octet-stream(附件下载) */
  contentTypeFor(relativePath: string): string {
    const ext = path.extname(relativePath).toLowerCase();
    return FileService.CONTENT_TYPES[ext] ?? 'application/octet-stream';
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

  /** 敏感附件判定：private/ 子目录下的文件读取须签名令牌 */
  isPrivate(relativePath: string): boolean {
    return (relativePath ?? '').replace(/^[/\\]+/, '').startsWith('private/');
  }

  /** 为敏感附件签发短时访问令牌（HMAC-SHA256(path:exp)，默认 5 分钟） */
  signToken(relativePath: string, ttlSec = 300): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const sig = crypto.createHmac('sha256', this.signSecret()).update(`${relativePath}:${exp}`).digest('hex').slice(0, 32);
    return `${exp}.${sig}`;
  }

  /** 校验敏感附件访问令牌（过期/签名不符均拒绝） */
  verifyToken(relativePath: string, token?: string): boolean {
    if (!token) return false;
    const dot = token.indexOf('.');
    if (dot <= 0) return false;
    const exp = +token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if (!exp || exp < Date.now() / 1000 || !sig) return false;
    const want = crypto.createHmac('sha256', this.signSecret()).update(`${relativePath}:${exp}`).digest('hex').slice(0, 32);
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
    } catch {
      return false;
    }
  }

  private signSecret(): string {
    return this.config.get('JWT_SECRET', 'i9-file-sign-fallback');
  }

  /**
   * 将相对路径转换为 X-Accel-Redirect 内部路径（给 Nginx 用）
   */
  toAccelPath(relativePath: string): string {
    return `/internal/files/${relativePath}`;
  }

  /**
   * 将相对路径解析为磁盘绝对路径（防目录穿越）；不存在返回 null
   */
  resolvePath(relativePath: string): string | null {
    const clean = relativePath.replace(/\.\.[/\\]?/g, '').replace(/^[/\\]+/, '');
    const full = path.join(this.uploadRoot, clean);
    if (!full.startsWith(this.uploadRoot)) return null;
    return fs.existsSync(full) ? full : null;
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
