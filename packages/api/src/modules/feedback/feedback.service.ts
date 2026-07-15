import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Feedback, FeedbackStatus } from './feedback.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { FileService } from '../../common/services/file.service';

const IMG_MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif',
};

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @InjectRepository(Feedback) private readonly repo: Repository<Feedback>,
    private readonly fileService: FileService,
  ) {}

  create(dto: CreateFeedbackDto, userId: number, username?: string) {
    const fb = this.repo.create({
      user_id: userId,
      username: username ?? null,
      content: dto.content,
      images: dto.images?.length ? JSON.stringify(dto.images) : null,
      page_url: dto.page_url ?? null,
      status: FeedbackStatus.PENDING,
    });
    return this.repo.save(fb);
  }

  async findAll(query: { page?: number; size?: number; status?: string }) {
    const size = Math.min(Math.max(Number(query.size) || 20, 1), 100);
    const page = Math.max(Number(query.page) || 1, 1);
    const where: any = { deleted: 0 };
    if (query.status) where.status = query.status as FeedbackStatus;
    const [items, total] = await this.repo.findAndCount({
      where, order: { id: 'DESC' }, skip: (page - 1) * size, take: size,
    });
    return { items, total, page, size };
  }

  async markHandled(id: number, handled = true, reply?: string) {
    const patch: any = { status: handled ? FeedbackStatus.HANDLED : FeedbackStatus.PENDING };
    // 有回复内容 → 记回复时间 + 置未读(提交人登录后右下角红点提醒)
    if (reply !== undefined) {
      patch.reply = reply || null;
      if (reply) { patch.reply_at = new Date(); patch.reply_read = 0; }
    }
    await this.repo.update({ id }, patch);
    return this.repo.findOne({ where: { id } });
  }

  /** 提交人:我的反馈(含管理员回复),按时间倒序 */
  async mine(userId: number, query: { page?: number; size?: number }) {
    const size = Math.min(Math.max(Number(query.size) || 20, 1), 100);
    const page = Math.max(Number(query.page) || 1, 1);
    const [items, total] = await this.repo.findAndCount({
      where: { user_id: userId, deleted: 0 }, order: { id: 'DESC' }, skip: (page - 1) * size, take: size,
    });
    return { items, total, page, size };
  }

  /** 提交人:未读回复数(右下角红点角标) */
  async unreadCount(userId: number) {
    const count = await this.repo
      .createQueryBuilder('f')
      .where('f.user_id = :userId AND f.deleted = 0 AND f.reply IS NOT NULL AND f.reply <> :empty AND f.reply_read = 0',
        { userId, empty: '' })
      .getCount();
    return { count };
  }

  /** 提交人:标记某条回复已读(消红点);仅本人可标记 */
  async markRead(id: number, userId: number) {
    await this.repo.update({ id, user_id: userId }, { reply_read: 1 });
    return { ok: true };
  }

  /** HTML 导出:仅未处理(PENDING);已处理不导出 */
  /**
   * 把上传图片内联成 base64 data URI —— 导出的 HTML 存的是
   * `/api/v1/uploads/file?p=<相对路径>`：相对地址 + 要 JWT 的接口，
   * 文件下载到本地用 file:// 打开必然裂图。内联后导出件自包含、离线可看。
   * 单图上限 2MB，超限/读不到则退回可点链接，不让导出整个失败。
   */
  private embedImage(url: string): string {
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
    const fallback = `<a href="${esc(url)}">图（未内联）</a>`;
    try {
      const p = /[?&]p=([^&]+)/.exec(url)?.[1];
      if (!p) return fallback;
      const rel = decodeURIComponent(p);
      const ext = path.extname(rel).toLowerCase();
      const mime = IMG_MIME[ext];
      if (!mime) return fallback; // 非图片(pdf/xlsx 等)保持链接
      const full = this.fileService.resolvePath(rel);
      if (!full) return fallback;
      const stat = fs.statSync(full);
      if (stat.size > 2 * 1024 * 1024) return fallback; // 大图不内联，免得导出件爆掉
      const b64 = fs.readFileSync(full).toString('base64');
      return `<a href="data:${mime};base64,${b64}" target="_blank"><img class="shot" src="data:${mime};base64,${b64}" alt="反馈截图"></a>`;
    } catch (e: any) {
      this.logger.warn(`反馈导出内联图片失败(${url}): ${e?.message}`);
      return fallback;
    }
  }

  async exportHtml(): Promise<string> {
    const rows = await this.repo.find({
      where: { status: FeedbackStatus.PENDING, deleted: 0 }, order: { id: 'DESC' }, take: 1000,
    });
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
    const imgs = (s: string) => {
      try { return (JSON.parse(s) as string[]).map((u) => this.embedImage(u)).join(' '); } catch { return ''; }
    };
    const trs = rows.map((r) => `<tr>
      <td class="mono">${esc(r.created_at)}</td>
      <td>${esc(r.username ?? r.user_id)}</td>
      <td>${esc(r.content)}</td>
      <td>${r.images ? imgs(r.images) : ''}</td>
      <td class="mono">${esc(r.page_url ?? '')}</td>
    </tr>`).join('');
    return this.htmlDoc('用户反馈(未处理)', `共 ${rows.length} 条未处理反馈 · 导出于 ${new Date().toLocaleString('zh-CN')}`,
      `<table><thead><tr><th>提交时间</th><th>提交人</th><th>问题描述</th><th>图片</th><th>提交页面</th></tr></thead><tbody>${trs}</tbody></table>`);
  }

  private htmlDoc(title: string, sub: string, body: string): string {
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>
body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;margin:24px;color:#1B2A3A;background:#fff}
h1{font-size:20px;margin:0 0 4px}.sub{color:#6E7883;font-size:13px;margin:0 0 18px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid #DBD9D2;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#1E3A5F;color:#fff;white-space:nowrap}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
tr:nth-child(even) td{background:#FAF8F2}
.shot{max-width:180px;max-height:120px;border:1px solid #DBD9D2;border-radius:4px;object-fit:cover;vertical-align:top;margin:2px 2px 0 0}
</style></head><body><h1>${title}</h1><p class="sub">${sub}</p>${body}</body></html>`;
  }
}
