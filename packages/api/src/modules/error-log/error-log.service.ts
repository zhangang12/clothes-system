import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ErrorLog, ErrorLogStatus } from './error-log.entity';

export interface RecordErrorInput {
  method: string;
  path: string;
  statusCode: number;
  code: number;
  errorType?: string;
  message: string;
  stack?: string;
  query?: unknown;
  params?: unknown;
  body?: unknown;
  userId?: number;
  username?: string;
  ip?: string;
}

@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger(ErrorLogService.name);

  constructor(
    @InjectRepository(ErrorLog) private readonly repo: Repository<ErrorLog>,
  ) {}

  /**
   * 自动记录一条服务器异常。同类报错(指纹相同)去重聚合:次数+1、更新末见时间与最近一次上下文,并重新置为未处理。
   * 全过程 fail-safe——记录失败绝不影响主请求。
   */
  async record(input: RecordErrorInput): Promise<void> {
    try {
      const fingerprint = this.fingerprint(input);
      const now = new Date();
      const reqInput = this.truncate(this.safeStringify({
        query: input.query, params: input.params, body: this.redact(input.body),
      }), 4000);
      const respOutput = this.truncate(this.safeStringify({ status: input.statusCode, code: input.code, msg: input.message }), 1000);

      const common = {
        method: input.method,
        path: this.truncate(input.path, 255),
        status_code: input.statusCode,
        code: input.code,
        error_type: input.errorType ?? null,
        message: this.truncate(input.message, 1000),
        stack: input.stack ? this.truncate(input.stack, 8000) : null,
        req_input: reqInput,
        resp_output: respOutput,
        user_id: input.userId ?? null,
        username: input.username ?? null,
        ip: input.ip ?? null,
        last_seen: now,
      };

      const existing = await this.repo.findOne({ where: { fingerprint }, select: ['id'] });
      if (existing) {
        await this.repo.update({ id: existing.id }, {
          ...common,
          count: () => 'count + 1',
          status: ErrorLogStatus.OPEN, // 复发即重新浮现,便于持续排查
        });
      } else {
        await this.repo.insert({
          fingerprint, ...common, count: 1, status: ErrorLogStatus.OPEN, first_seen: now,
        });
      }
    } catch (e) {
      // 记录失败仅内部告警,不抛出(避免掩盖/放大原始异常)
      this.logger.warn(`error-log 记录失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  async findAll(query: { page?: number; size?: number; status?: string }) {
    const size = Math.min(Math.max(Number(query.size) || 20, 1), 100);
    const page = Math.max(Number(query.page) || 1, 1);
    const where = query.status ? { status: query.status as ErrorLogStatus } : {};
    const [items, total] = await this.repo.findAndCount({
      where, order: { last_seen: 'DESC' }, skip: (page - 1) * size, take: size,
    });
    return { items, total, page, size };
  }

  findOne(id: number) {
    return this.repo.findOne({ where: { id } });
  }

  async markHandled(id: number, handled = true) {
    await this.repo.update({ id }, { status: handled ? ErrorLogStatus.HANDLED : ErrorLogStatus.OPEN });
    return this.repo.findOne({ where: { id } });
  }

  /** HTML 导出:仅未处理(OPEN)的报错;已处理不导出 */
  async exportHtml(): Promise<string> {
    const rows = await this.repo.find({ where: { status: ErrorLogStatus.OPEN }, order: { last_seen: 'DESC' }, take: 1000 });
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
    const trs = rows.map((r) => `<tr>
      <td class="mono">${esc(r.last_seen)}</td>
      <td class="num">${esc(r.count)}</td>
      <td><span class="tag">${esc(r.method)}</span> <span class="mono">${esc(r.path)}</span></td>
      <td class="num">${esc(r.status_code)}</td>
      <td>${esc(r.error_type)}<br><span class="msg">${esc(r.message)}</span></td>
      <td class="ctx"><b>输入</b><pre>${esc(r.req_input)}</pre><b>输出</b><pre>${esc(r.resp_output)}</pre>${r.stack ? `<b>堆栈</b><pre>${esc(r.stack)}</pre>` : ''}</td>
      <td>${esc(r.username ?? '')}<br>${esc(r.ip ?? '')}</td>
    </tr>`).join('');
    return this.htmlDoc('系统报错记录(未处理)', `共 ${rows.length} 类未处理报错 · 导出于 ${new Date().toLocaleString('zh-CN')}`,
      `<table><thead><tr><th>末见时间</th><th>次数</th><th>接口</th><th>状态码</th><th>错误</th><th>操作上下文(输入/输出/堆栈)</th><th>用户/IP</th></tr></thead><tbody>${trs}</tbody></table>`);
  }

  private fingerprint(i: RecordErrorInput): string {
    const normPath = i.path.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id');
    const basis = `${i.method} ${normPath} ${i.errorType ?? ''} ${(i.message ?? '').slice(0, 120)}`;
    return crypto.createHash('sha1').update(basis).digest('hex');
  }

  private redact(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;
    const clone: any = Array.isArray(obj) ? [...(obj as any[])] : { ...(obj as any) };
    for (const k of Object.keys(clone)) {
      if (/pass|pwd|secret|token/i.test(k)) clone[k] = '***';
      else if (clone[k] && typeof clone[k] === 'object') clone[k] = this.redact(clone[k]);
    }
    return clone;
  }

  private safeStringify(v: unknown): string {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  private truncate(s: string, n: number): string {
    return s && s.length > n ? s.slice(0, n) + '…(截断)' : s;
  }

  private htmlDoc(title: string, sub: string, body: string): string {
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>
body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;margin:24px;color:#1B2A3A;background:#fff}
h1{font-size:20px;margin:0 0 4px}.sub{color:#6E7883;font-size:13px;margin:0 0 18px}
table{border-collapse:collapse;width:100%;font-size:12.5px}
th,td{border:1px solid #DBD9D2;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#1E3A5F;color:#fff;white-space:nowrap}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace}.num{text-align:right;font-variant-numeric:tabular-nums}
.tag{background:#1E3A5F;color:#fff;padding:1px 6px;border-radius:4px;font-size:11px}
.msg{color:#A93226}.ctx pre{margin:2px 0 8px;background:#F5F3EC;padding:6px;border-radius:4px;white-space:pre-wrap;word-break:break-all;max-width:520px;overflow:auto}
tr:nth-child(even) td{background:#FAF8F2}
</style></head><body><h1>${title}</h1><p class="sub">${sub}</p>${body}</body></html>`;
  }
}
