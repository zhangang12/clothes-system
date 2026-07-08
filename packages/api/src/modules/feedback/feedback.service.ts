import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback, FeedbackStatus } from './feedback.entity';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback) private readonly repo: Repository<Feedback>,
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
    await this.repo.update(
      { id },
      { status: handled ? FeedbackStatus.HANDLED : FeedbackStatus.PENDING, reply: reply ?? null },
    );
    return this.repo.findOne({ where: { id } });
  }

  /** HTML 导出:仅未处理(PENDING);已处理不导出 */
  async exportHtml(): Promise<string> {
    const rows = await this.repo.find({
      where: { status: FeedbackStatus.PENDING, deleted: 0 }, order: { id: 'DESC' }, take: 1000,
    });
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
    const imgs = (s: string) => {
      try { return (JSON.parse(s) as string[]).map((u) => `<a href="${esc(u)}">图</a>`).join(' '); } catch { return ''; }
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
</style></head><body><h1>${title}</h1><p class="sub">${sub}</p>${body}</body></html>`;
  }
}
