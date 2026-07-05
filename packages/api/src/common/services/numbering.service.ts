import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

// 前缀常量（对齐《系统开发手册》核心数据模型 · 编号规则）
export const NUM_PREFIX = {
  FACTORY: 'S',    // 厂商编号 S001（基础资料设计稿 §1.1 D2，nextGlobal 全局递增）
  CUSTOMER: 'CN',  // 客户编号（旧，保留兼容）
  CUSTOMER_MIDDLEMAN: 'CM', // 中间商编号 CM001（设计稿 A8）
  CUSTOMER_BUYER: 'FE',     // 最终买家编号 FE001（设计稿 A8）
  SAMPLE: 'S',     // 样衣编号 S-YYYYMMDD-序号（样衣设计稿 §D1，next 按日递增）
  QUOTATION: 'Q',
  ORDER: 'O',
  CONTRACT: 'HT',
  PAYMENT: 'PR',
  RECONCILIATION: 'DZ',
  SHIPMENT: 'FH',   // 发货单 FH-款号-序号（设计稿 补充确认 A2）
  SETTLEMENT: 'JS',
} as const;

@Injectable()
export class NumberingService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * 生成带日期的流水号，格式：{prefix}-{YYYYMMDD}-{3位序号}
   * 例如：HT-20260705-001
   */
  async next(prefix: string, date?: Date): Promise<string> {
    const d = date ?? new Date();
    const ymd = this.formatDate(d);
    const key = `seq:${prefix}:${ymd}`;
    // Atomic INCR + conditional EXPIRE in one Lua round-trip
    const seq = await this.redis.eval(
      `local v = redis.call('INCR', KEYS[1])
       if v == 1 then redis.call('EXPIRE', KEYS[1], 172800) end
       return v`,
      1,
      key,
    ) as number;
    return `${prefix}-${ymd}-${String(seq).padStart(3, '0')}`;
  }

  /**
   * 生成带自定义段的流水号，格式：{prefix}-{segment}-{3位序号}
   * 用于 款号维度 编号：对账单 DZ-款号-序号、发货单 FH-款号-序号（设计稿 补充确认 A2）
   */
  async nextWithSegment(prefix: string, segment: string): Promise<string> {
    const seg = (segment && String(segment).trim()) || 'NA';
    const key = `seq:${prefix}:${seg}`;
    const seq = await this.redis.eval(
      `local v = redis.call('INCR', KEYS[1])
       if v == 1 then redis.call('EXPIRE', KEYS[1], 2592000) end
       return v`,
      1,
      key,
    ) as number;
    return `${prefix}-${seg}-${String(seq).padStart(3, '0')}`;
  }

  /**
   * 生成不带日期的全局递增号，格式：{prefix}{6位序号}
   * 用于工厂编号(CN001)、客户编号(S001)等永久性编号
   */
  async nextGlobal(prefix: string): Promise<string> {
    const key = `seq:global:${prefix}`;
    const seq = await this.redis.incr(key);
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }
}
