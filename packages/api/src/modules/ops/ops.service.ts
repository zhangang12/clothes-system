import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';

const BK_LOG = '/var/log/i9-backup.log';
const OW_LOG = '/var/log/i9-ops-watch.log';
const BK_DIR = '/data/backups';
const DT = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;

/**
 * 运维监控只读数据源 —— 供离线监控页 HTML 运行时自行拉取。
 * 全部读取容错：任一来源失败只返回 null/0，绝不抛出。
 */
@Injectable()
export class OpsService {
  constructor(private readonly dataSource: DataSource) {}

  async status() {
    const now = new Date();
    return {
      systemTime: this.cst(now), // 统一北京时间，规避进程 TZ 差异
      serverEpoch: now.getTime(),
      tz: 'CST (UTC+8)',
      errors: await this.count("SELECT COUNT(*) c FROM error_log WHERE status='OPEN'"),
      feedback: await this.count("SELECT COUNT(*) c FROM feedback WHERE status='PENDING' AND deleted=0"),
      backup: this.backup(),
      watch: this.watch(),
    };
  }

  private cst(d: Date): string {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(d);
  }

  private async count(sql: string): Promise<number | null> {
    try {
      const r = await this.dataSource.query(sql);
      return Number(r?.[0]?.c ?? 0);
    } catch {
      return null;
    }
  }

  private backup() {
    try {
      const lines = fs.readFileSync(BK_LOG, 'utf8').split('\n')
        .filter((l) => l.includes('备份完成') && !l.includes('上传文件'));
      const last = lines[lines.length - 1] || '';
      const time = (last.match(DT) || [])[0] || null;
      const size = (last.match(/大小=([0-9.]+[KMGT]?)/) || [])[1] || null;
      let count = 0;
      try {
        count = fs.readdirSync(BK_DIR).filter((f) => /^i9_clothes_.*\.sql\.gz$/.test(f)).length;
      } catch { /* 目录不可读则计数 0 */ }
      return { time, size, count };
    } catch {
      return { time: null, size: null, count: 0 };
    }
  }

  private watch() {
    try {
      const lines = fs.readFileSync(OW_LOG, 'utf8').trim().split('\n');
      const last = lines[lines.length - 1] || '';
      const time = (last.match(DT) || [])[0] || null;
      const result = last.replace(/^\[[^\]]*\]\s*/, '').trim() || null;
      return { time, result };
    } catch {
      return { time: null, result: null };
    }
  }
}
